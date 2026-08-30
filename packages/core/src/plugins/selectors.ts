import type { Engine } from '../engine'
import type { EnginePlugin } from '../plugin'
import type { TypegenJSDocRenderBindings } from '../typegen/jsdoc'
import type { TypegenDocumentation } from '../typegen/snapshot'
import type { Arrayable, Awaitable, Nullish, ResolvedSelector, UnionString } from '../types'
import { hasAtomicStyleIdPlaceholder, replaceAtomicStyleIdPlaceholder } from '../constants'
import { normalizeSelectors } from '../extractor'
import { registerCoreEngineFinalizer } from '../finalization'
import { defineEnginePlugin } from '../plugin'
import { matchesRulePattern, RecursiveResolver, resolveRuleConfig } from '../resolver'
import { renderTypegenJSDoc } from '../typegen/jsdoc'
import { runPreviewSelectorPipeline, setPreviewSelectorTransform } from '../typegen/preview'
import { setCoreGeneratedTypegenContribution } from '../typegen/registry'

/** Static selector definition in the frozen object-only authoring grammar. */
export interface StaticSelector {
	/** Name used to reference the selector in a style definition. */
	name: string
	/** Selector or selectors emitted when the named selector is resolved. */
	value: Arrayable<UnionString | ResolvedSelector>
	/**
	 * Optional authored documentation for the generated Typegen selector member. When a resolved preview is available, the description is rendered before it.
	 * @default `undefined`
	 */
	description?: string
}

/** Dynamic selector definition with separate runtime and TypeScript input contracts. */
export interface DynamicSelector {
	/** Pattern matched against a selector reference. */
	pattern: RegExp
	/** TypeScript input expression for selector references handled by this rule. */
	inputType: string
	/** Resolves a matched selector reference to one or more CSS selectors. */
	resolve: (matched: RegExpMatchArray) => Awaitable<Arrayable<UnionString | ResolvedSelector> | Nullish>
	/**
	 * Concrete selector references offered in Typegen autocomplete.
	 * @default `[]`
	 */
	autocomplete?: Arrayable<string>
	/**
	 * Optional authored documentation for generated concrete autocomplete members. When a resolved preview is available, the description is rendered before it.
	 * @default `undefined`
	 */
	description?: string
}

/** User-facing selector definition. Tuple/string shorthand forms are intentionally unsupported. */
export type Selector = StaticSelector | DynamicSelector

/** Configuration for the built-in selector subsystem. */
export interface SelectorsConfig {
	/** Static and dynamic selector definitions available to the engine. */
	definitions: Selector[]
}

declare module '@pikacss/core' {
	interface EngineConfig {
		/** Selector definitions consumed once during Engine initialization. */
		selectors?: SelectorsConfig
	}
}

interface SelectorsState {
	definitions: Selector[]
	resolver?: SelectorResolver
}

interface SelectorDeclarationSnapshot {
	readonly explicit: readonly (readonly [name: string, documentation: TypegenDocumentation])[]
	readonly dynamicTypes: readonly string[]
}

function snapshotSelectorDeclarations(
	definitions: readonly Selector[],
	documentation: ReadonlyMap<string, TypegenDocumentation> = new Map(),
	onInvalidAutocomplete: (value: string, pattern: RegExp) => void = () => {},
): SelectorDeclarationSnapshot {
	const explicit = new Map<string, TypegenDocumentation>()
	const dynamicTypes: string[] = []
	for (const definition of definitions) {
		if ('name' in definition) {
			explicit.set(definition.name, documentation.get(definition.name) ?? Object.freeze({ description: definition.description }))
			continue
		}
		dynamicTypes.push(definition.inputType)
		for (const value of [definition.autocomplete ?? []].flat()) {
			if (!matchesRulePattern(definition.pattern, value)) {
				onInvalidAutocomplete(value, definition.pattern)
				continue
			}
			explicit.set(value, documentation.get(value) ?? Object.freeze({ description: definition.description }))
		}
	}
	return Object.freeze({
		explicit: Object.freeze([...explicit]
			.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
			.map(([name, docs]) => Object.freeze([name, docs] as const))),
		dynamicTypes: Object.freeze([...dynamicTypes]),
	})
}

function renderSelectorDeclarations(snapshot: SelectorDeclarationSnapshot, bindings: TypegenJSDocRenderBindings = {}): string {
	const lines = ['interface __PikaExplicitSelectors {']
	for (const [name, docs] of snapshot.explicit) {
		lines.push(...renderTypegenJSDoc(docs, bindings, '  '))
		lines.push(`  ${JSON.stringify(name)}?: __StyleDefinition | __StyleItem[]`)
	}
	lines.push('}')
	if (snapshot.dynamicTypes.length === 0) {
		lines.push('type __PikaSelectors = __PikaExplicitSelectors')
	}
	else {
		lines.push(`type __PikaDynamicSelectorInput = ${snapshot.dynamicTypes.join(' | ')}`)
		lines.push('type __PikaDynamicSelectors = { [K in __PikaDynamicSelectorInput]?: __StyleDefinition | __StyleItem[] }')
		lines.push('type __PikaSelectors = __PikaExplicitSelectors & __PikaDynamicSelectors')
	}
	return lines.join('\n')
}

function createSelectorResolver(
	definitions: readonly Selector[],
	onDiagnostic: ConstructorParameters<typeof SelectorResolver>[0],
): SelectorResolver {
	const resolver = new SelectorResolver(onDiagnostic)
	for (const definition of definitions) {
		const resolved = resolveSelectorConfig(definition)!
		if (resolved.type === 'static')
			resolver.addStaticRule(resolved.rule)
		else
			resolver.addDynamicRule(resolved.rule)
	}
	return resolver
}

function renderSelectorPreview(selectors: readonly string[], defaultSelector: string): string | undefined {
	const normalized = normalizeSelectors({ selectors: [...selectors], defaultSelector })
	if (normalized.length === 0 || normalized.every(selector => !hasAtomicStyleIdPlaceholder(selector)))
		normalized.push(defaultSelector)
	const rendered = normalized
		.map(selector => replaceAtomicStyleIdPlaceholder(selector, 'pika-preview'))
		.filter(Boolean)
	if (rendered.length === 0)
		return undefined

	const lines: string[] = []
	for (let depth = 0; depth < rendered.length; depth++)
		lines.push(`${'  '.repeat(depth)}${rendered[depth]} {`)
	for (let depth = rendered.length - 1; depth >= 0; depth--)
		lines.push(`${'  '.repeat(depth)}}`)
	return lines.join('\n')
}

function collectConcreteSelectorOwners(
	definitions: readonly Selector[],
	onInvalidAutocomplete: (value: string, pattern: RegExp) => void,
): { concrete: string[], owners: ReadonlyMap<string, Selector> } {
	const staticOwners = new Map<string, StaticSelector>()
	const dynamicOrder: string[] = []
	const dynamicOwners = new Map<string, DynamicSelector>()
	const concreteSet = new Set<string>()

	for (const definition of definitions) {
		if ('name' in definition) {
			staticOwners.set(definition.name, definition)
			concreteSet.add(definition.name)
			continue
		}
		const key = definition.pattern.source
		if (!dynamicOwners.has(key))
			dynamicOrder.push(key)
		dynamicOwners.set(key, definition)
		for (const value of [definition.autocomplete ?? []].flat()) {
			if (!matchesRulePattern(definition.pattern, value)) {
				onInvalidAutocomplete(value, definition.pattern)
				continue
			}
			concreteSet.add(value)
		}
	}

	const concrete = [...concreteSet].sort()
	const owners = new Map<string, Selector>()
	for (const member of concrete) {
		const staticOwner = staticOwners.get(member)
		if (staticOwner != null) {
			owners.set(member, staticOwner)
			continue
		}
		for (const key of dynamicOrder) {
			const definition = dynamicOwners.get(key)!
			if (matchesRulePattern(definition.pattern, member)) {
				owners.set(member, definition)
				break
			}
		}
	}
	return { concrete, owners }
}

function createSelectorPreviewTransform(engine: Engine, ownerPlugin: EnginePlugin, definitions: readonly Selector[]) {
	let resolutionFailure: unknown
	const resolver = createSelectorResolver(definitions, (diagnostic) => {
		if (diagnostic.code === 'resolver-resolution-error') {
			resolutionFailure ??= diagnostic.cause ?? new Error(diagnostic.message)
			return
		}
		engine.reportDiagnostic(diagnostic)
	})
	const coreTransform = async (selectors: string[]) => {
		const result: string[] = []
		for (const selector of selectors)
			result.push(...await resolver.resolve(selector))
		return result
	}
	return async (selectors: string[]): Promise<string[]> => {
		resolutionFailure = undefined
		const result = await runPreviewSelectorPipeline(engine, ownerPlugin, selectors, coreTransform)
		if (resolutionFailure != null)
			throw resolutionFailure
		return result
	}
}

async function finalizeSelectorTypegen(
	engine: Engine,
	ownerPlugin: EnginePlugin,
	definitions: readonly Selector[],
	onDiagnostic: (diagnostic: { level: 'warning', code: string, message: string, cause?: unknown }) => void,
): Promise<void> {
	const documentation = new Map<string, TypegenDocumentation>()
	const { concrete, owners } = collectConcreteSelectorOwners(definitions, (value, pattern) => onDiagnostic({
		level: 'warning',
		code: 'selector-autocomplete-pattern-mismatch',
		message: `Selector autocomplete value "${value}" does not match ${pattern}`,
	}))
	const previewTransform = createSelectorPreviewTransform(engine, ownerPlugin, definitions)
	setPreviewSelectorTransform(engine, previewTransform)

	for (const member of concrete) {
		const owner = owners.get(member)
		if (owner == null)
			continue
		let previewCss: string | undefined
		try {
			previewCss = renderSelectorPreview(await previewTransform([member]), engine.config.defaultSelector)
		}
		catch (cause) {
			onDiagnostic({
				level: 'warning',
				code: 'selector-preview-resolution-error',
				message: `Failed to render Typegen preview for selector "${member}": ${cause instanceof Error ? cause.message : String(cause)}`,
				cause,
			})
		}
		documentation.set(member, Object.freeze({
			description: owner.description,
			...(previewCss == null ? {} : { previewCss }),
		}))
	}

	const declarationSnapshot = snapshotSelectorDeclarations(definitions, documentation)
	const render = (bindings: TypegenJSDocRenderBindings) => renderSelectorDeclarations(declarationSnapshot, bindings)
	setCoreGeneratedTypegenContribution(engine.typegen, 'core:selectors', {
		declarations: render({}),
		renderDeclarations: render,
	})
}

/** Built-in selector subsystem. Effective raw config is its only semantic ingress. */
export function selectors() {
	const plugin = defineEnginePlugin({
		name: 'core:selectors',
		createState: (): SelectorsState => ({ definitions: [] }),
		rawConfigConfigured(config, context) {
			context.state.definitions = config.selectors?.definitions ?? []
		},
		configureEngine(configurator) {
			const acceptedDefinitions = configurator.state.definitions
				.filter(definition => resolveSelectorConfig(definition) != null)
			const resolver = createSelectorResolver(acceptedDefinitions, configurator.onDiagnostic)
			configurator.state.definitions = acceptedDefinitions
			configurator.state.resolver = resolver

			const declarationSnapshot = snapshotSelectorDeclarations(acceptedDefinitions)
			configurator.typegen.add({
				id: 'core:selectors',
				// Final concrete documentation is rebuilt by the Core-private
				// finalizer after higher-level plugins finish Engine configuration.
				declarations: renderSelectorDeclarations(declarationSnapshot),
				selectors: '__PikaSelectors',
			})
			registerCoreEngineFinalizer(configurator.runtime, () => finalizeSelectorTypegen(
				configurator.runtime,
				plugin,
				acceptedDefinitions,
				configurator.onDiagnostic,
			))
		},
		async transformSelectors(selectors, context) {
			const resolver = context.state.resolver
			if (resolver == null)
				return selectors
			const result: string[] = []
			for (const selector of selectors)
				result.push(...await resolver.resolve(selector))
			return result
		},
	})
	return plugin
}

class SelectorResolver extends RecursiveResolver<string> {}

/** @internal */
export function resolveSelectorConfig(config: Selector) {
	return resolveRuleConfig<string>(config)
}
