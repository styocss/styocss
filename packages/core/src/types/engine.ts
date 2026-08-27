import type { EnginePlugin } from '../plugin'
import type { Preflight, ResolvedPreflight } from './preflight'

/**
 * User-facing configuration object for creating a PikaCSS engine instance via `createEngine()`.
 *
 * @remarks All fields are optional and fall back to sensible defaults. Plugins can further modify this config through the `configureRawConfig` hook before resolution.
 *
 * @example
 * ```ts
 * const config: EngineConfig = {
 *   prefix: 'pk-',
 *   plugins: [myPlugin()],
 *   layers: { base: 0, components: 5, utilities: 10 },
 * }
 * ```
 */
export interface EngineConfig {
	/**
	 * Engine plugins that extend the engine with additional functionality (selectors, shortcuts, variables, etc.).
	 *
	 * @default `[]`
	 */
	plugins?: EnginePlugin[]

	/**
	 * String prefix prepended to every generated atomic CSS class name.
	 *
	 * @default `'pk-'`
	 */
	prefix?: string

	/**
	 * Default CSS selector template for atomic rules. The `%` placeholder is replaced with the generated class ID.
	 *
	 * @default `'.%'`
	 */
	defaultSelector?: string

	/**
	 * Global preflight styles injected before atomic rules. Accepts raw CSS strings, definition objects, functions, or wrapped variants with layer/id metadata.
	 *
	 * @default `[]`
	 */
	preflights?: Preflight[]

	/**
	 * CSS `@import` statements prepended to the generated stylesheet output.
	 *
	 * @default `[]`
	 */
	cssImports?: string[]

	/**
	 * Named CSS layers and their numeric sort order. Lower numbers appear first in the `@layer` declaration.
	 *
	 * @default `{ preflights: 1, utilities: 10 }`
	 */
	layers?: Record<string, number>

	/**
	 * Name of the CSS `@layer` used for preflight styles that do not specify an explicit layer.
	 *
	 * @default `'preflights'`
	 */
	defaultPreflightsLayer?: string

	/**
	 * Name of the CSS `@layer` used for atomic utility styles that do not specify an explicit layer.
	 *
	 * @default `'utilities'`
	 */
	defaultUtilitiesLayer?: string
}

/**
 * Fully resolved engine configuration produced after plugin hooks have processed the raw config.
 * @internal
 *
 * @remarks Created by `resolveEngineConfig()` and further refined by the `configureResolvedConfig` hook. All optional fields from `EngineConfig` have been populated with defaults, and collections are normalized into `Set`/`Map` structures where appropriate.
 *
 * @example
 * ```ts
 * const resolved: ResolvedEngineConfig = await resolveEngineConfig(userConfig)
 * console.log(resolved.prefix) // 'pk-'
 * ```
 */
export interface ResolvedEngineConfig {
	/** The original user-supplied `EngineConfig` before resolution, preserved for introspection. */
	rawConfig: EngineConfig
	/** Resolved class name prefix for atomic style IDs. */
	prefix: string
	/** Resolved default CSS selector template with `%` as the ID placeholder. */
	defaultSelector: string
	/** Sorted list of engine plugins after order resolution (`pre` → default → `post`). */
	plugins: EnginePlugin[]
	/** Normalized preflight entries ready for rendering. */
	preflights: ResolvedPreflight[]
	/** Deduplicated and semicolon-terminated CSS `@import` statements. */
	cssImports: string[]	/** CSS `@layer` name-to-order mapping used for ordering layer blocks in output. */
	layers: Record<string, number>
	/** Name of the default `@layer` for preflight styles. */
	defaultPreflightsLayer: string
	/** Name of the default `@layer` for atomic utility styles. */
	defaultUtilitiesLayer: string
}
