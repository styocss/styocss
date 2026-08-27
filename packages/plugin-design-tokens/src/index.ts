import type { DiagnosticHandler, EnginePlugin } from '@pikacss/core'
import type { TokenIR } from './ir'
import type { DesignTokensReport } from './report'
import type { StrictContext } from './strict'
import type { DesignTokensConfig, DesignTokensRuntimeOptions, TokenLayer } from './types'
import { defineEnginePlugin } from '@pikacss/core'
import { setDeprecatedTokenNames } from './deprecated'
import { buildVariablesDefinition } from './emit'
import { setLayerTokenNames } from './layer'
import { loadAllSources, noopDiagnosticHandler } from './load'
import { tokenPathToVariableName } from './naming'
import { normalizeTokens } from './normalize'
import { computeDesignTokensReport } from './report'
import { buildStrictContext, checkDeclaration, isStrictActive } from './strict'
import { buildStrictTypeEntries } from './strict-types'
import { setTokenTypeNames } from './type-registry'
import { buildDesignTokenTypegen } from './typegen'

export { DEFAULT_TYPE_AUTOCOMPLETE } from './autocomplete'
export { parseDesignMarkdown } from './load'

export { tokenPathToVariableName } from './naming'
export type { DesignTokensReport } from './report'
export type { StrictTypeEntry } from './strict-types'
export type {
	DesignToken,
	DesignTokenGroup,
	DesignTokensConfig,
	DesignTokensLoader,
	DesignTokensNormalizer,
	DesignTokensRuntimeOptions,
	DesignTokensSource,
	DesignTokensSourceEntry,
	DesignTokensStrictConfig,
	DesignTokensTheme,
	DesignTokenValue,
	LoaderCtx,
	NormalizeCtx,
	StrictLevel,
	TokenLayer,
} from './types'

declare module '@pikacss/core' {
	interface EngineConfig {
		/**
		 * Design tokens configuration. Tokens are converted to CSS variables via the `variables` system.
		 *
		 * @default undefined
		 */
		designTokens?: DesignTokensConfig
	}

	interface Engine {
		/**
		 * Design-token surface, present when the `designTokens` plugin is registered.
		 * Strict-mode diagnostics are delivered through the engine's `onDiagnostic`
		 * handler during `transformStyleDefinitions`, so there is no queue to drain.
		 */
		designTokens?: {
			/**
			 * Computes a token-usage report from the engine's current atomic-style
			 * store: total registered tokens, used/unused token variable names,
			 * deprecated tokens in use, and cumulative strict-violation counts.
			 */
			report: () => DesignTokensReport
		}
	}
}

/**
 * PikaCSS engine plugin that converts design tokens (W3C Design Tokens JSON or `design.md` documents) into CSS variables.
 *
 * @param runtime - Optional host capabilities for resolving file-backed sources.
 * @returns An `EnginePlugin` that reads `EngineConfig.designTokens`, loads all token sources, and merges the resulting variables into `EngineConfig.variables`.
 *
 * @remarks The neutral entry accepts inline token objects. File-backed sources require the `/node` adapter or a custom runtime capability. Tokens flow through the core `variables` system, so they inherit unused-pruning, Variables-owned suggestion/Typegen integration, and selector scoping. Loaded files are registered as config dependencies. Strict-mode violations are reported through the engine's `onDiagnostic` handler; hosts collect error-level diagnostics to fail the build.
 *
 * @example
 * ```ts
 * import { designTokens } from '@pikacss/plugin-design-tokens/node'
 * import { defineConfig } from '@pikacss/unplugin-pikacss'
 *
 * export default defineConfig({
 *   engine: {
 *     plugins: [designTokens()],
 *     designTokens: {
 *       sources: ['./design.md'],
 *       themes: { dark: { selector: '.dark' } },
 *     },
 *   },
 * })
 * ```
 */
export function designTokens(runtime: DesignTokensRuntimeOptions = {}): EnginePlugin {
	// The plugin object is a reusable definition (#116): every mutable value
	// below is engine-local and lives in `context.state`, initialized fresh
	// per engine. `runtime` stays in the closure as immutable definition
	// configuration.
	return defineEnginePlugin({
		name: 'design-tokens',
		order: 'pre',
		createState: () => ({
			loadedFiles: [] as string[],
			// Deprecated token variable names collected for this engine. Recorded
			// against the engine in configureEngine so a later batch can warn on usage.
			deprecatedNames: new Set<string>() as ReadonlySet<string>,
			// Token variable name → declared layer, recorded against the engine so a
			// later strict-mode batch can enforce layer boundaries.
			layerNames: new Map<string, TokenLayer>() as ReadonlyMap<string, TokenLayer>,
			// Token variable name → declared `$type`, recorded against the engine for
			// strict mode's governed-property resolution.
			typeNames: new Map<string, string>() as ReadonlyMap<string, string>,
			// Resolved strict-mode context, or null when no `designTokens` config is
			// present or every strict check is `'off'` (zero-cost transform path).
			strictCtx: null as StrictContext | null,
			// Design Tokens-owned static Pika root and Typegen contribution, derived
			// once from normalized token state during configureRawConfig.
			typegenSurface: null as ReturnType<typeof buildDesignTokenTypegen> | null,
			// Every registered token variable name (all kinds, incl. external
			// aliases), used by `report()` to partition tokens into used/unused.
			allTokenVarNames: new Set<string>() as ReadonlySet<string>,
			// Cumulative strict-mode violation counters, incremented as diagnostics
			// are produced during transform. Read by `report()` so it reflects the
			// whole run. limit: in a dev server these accumulate across HMR
			// re-transforms of the same module; the report is designed for a single
			// build pass.
			strictViolations: { warning: 0, error: 0 },
		}),
		configureRawConfig: async (config, context) => {
			const tokensConfig = config.designTokens
			if (tokensConfig == null)
				return

			const state = context.state
			// Deliberately defensive despite the required context type: token
			// loading must degrade to the logger fallback when a host invokes
			// the hook with a context lacking onDiagnostic (pinned by test).
			const onDiagnostic = context?.onDiagnostic ?? noopDiagnosticHandler
			// Same defensive posture as onDiagnostic above: a hand-built context
			// lacking `host` degrades to the standalone fallback instead of throwing.
			const loaded = await loadAllSources(tokensConfig, runtime, onDiagnostic, context?.host?.projectRoot)
			state.loadedFiles = loaded.files

			const irNodes = normalizeTokens(loaded, tokensConfig)
			const prefix = tokensConfig.prefix ?? ''
			// Variable names respect each token's per-source effective prefix.
			const varName = (ir: TokenIR) => tokenPathToVariableName(ir.path, ir.prefix ?? prefix)
			state.allTokenVarNames = new Set(irNodes.map(varName))
			state.deprecatedNames = new Set(
				irNodes
					.filter(ir => ir.deprecated === true)
					.map(varName),
			)
			state.layerNames = new Map(
				irNodes
					.filter((ir): ir is TokenIR & { layer: TokenLayer } => ir.layer != null)
					.map(ir => [varName(ir), ir.layer]),
			)
			state.typeNames = new Map(
				irNodes
					.filter((ir): ir is TokenIR & { type: string } => ir.type != null)
					.map(ir => [varName(ir), ir.type]),
			)

			// Resolve the strict context once; keep it only when a check is active so
			// the transform hook can early-return with no work when strict is off.
			const candidate = buildStrictContext(irNodes, tokensConfig, prefix, state.deprecatedNames, state.layerNames)
			state.strictCtx = isStrictActive(candidate) ? candidate : null

			// Type narrowing is opt-in and independent of `strict.level`: it is a
			// compile-time surface, so it is computed from the same context even when
			// every transform-time check is `'off'`.
			const strictTypeEntries = tokensConfig.strict?.types === true
				? buildStrictTypeEntries(candidate)
				: []
			state.typegenSurface = buildDesignTokenTypegen(irNodes, prefix, strictTypeEntries)

			const definition = buildVariablesDefinition(irNodes, tokensConfig)
			if (Object.keys(definition).length === 0)
				return

			config.variables ??= {}
			config.variables.definitions = [
				...[config.variables.definitions ?? []].flat(),
				definition,
			]
		},
		configureEngine: (configurator) => {
			const engine = configurator.runtime
			// These closures/capabilities capture only this Engine's finalized state.
			const state = configurator.state
			state.loadedFiles.forEach(file => engine.addConfigDependency(file))
			setDeprecatedTokenNames(engine, state.deprecatedNames)
			setLayerTokenNames(engine, state.layerNames)
			setTokenTypeNames(engine, state.typeNames)
			if (state.typegenSurface != null) {
				configurator.pika.extendStatic('tk', state.typegenSurface.runtime)
				configurator.typegen.add(state.typegenSurface.contribution)
			}
			engine.designTokens = {
				report: () => computeDesignTokensReport(engine, state.allTokenVarNames, state.deprecatedNames, state.strictViolations),
			}
		},
		transformStyleDefinitions: (styleDefinitions, context) => {
			const state = context.state
			// Zero-cost path when strict mode is off.
			if (state.strictCtx == null)
				return styleDefinitions
			const strictCtx = state.strictCtx
			const onDiagnostic = context?.onDiagnostic ?? noopDiagnosticHandler
			// Fold every produced diagnostic into the cumulative counters before
			// forwarding it to the host handler.
			const emit: DiagnosticHandler = (diagnostic) => {
				if (diagnostic.level === 'error')
					state.strictViolations.error++
				else
					state.strictViolations.warning++
				onDiagnostic(diagnostic)
			}
			for (const definition of styleDefinitions) {
				for (const [property, value] of Object.entries(definition as Record<string, unknown>))
					checkDeclaration(property, value, strictCtx, emit)
			}
			// Pure inspector: the definitions flow through unchanged.
			return styleDefinitions
		},
	})
}
