import type { Engine } from '../engine'
import type { EnginePlugin } from '../plugin'
import type { TypegenJSDocRenderBindings } from '../typegen/jsdoc'
import type { TypegenDocumentation, TypegenPreviewAsset } from '../typegen/snapshot'
import type { Arrayable, Awaitable, CSSStyleBlocks, InternalStyleItem, Nullish, ResolvedStyleItem, StyleContent } from '../types'
import { hasAtomicStyleIdPlaceholder, LAYER_SELECTOR_PREFIX, replaceAtomicStyleIdPlaceholder } from '../constants'
import { registerCoreEngineFinalizer } from '../finalization'
import { defineEnginePlugin } from '../plugin'
import { matchesRulePattern, RecursiveResolver, resolveRuleConfig } from '../resolver'
import { renderTypegenJSDoc } from '../typegen/jsdoc'
import { preparePreviewUse, runPreviewStyleItemPipeline } from '../typegen/preview'
import { setCoreGeneratedTypegenContribution } from '../typegen/registry'
import { renderCSSStyleBlocks } from '../utils'

/** Static shortcut definition in the frozen object-only authoring grammar. */
export interface StaticShortcut {
	/** Name used to reference the shortcut in a `pika()` call. */
	name: string
	/** Style items expanded when the named shortcut is resolved. */
	value: Arrayable<ResolvedStyleItem>
	/**
	 * Optional authored documentation for the generated Typegen shortcut member. When a resolved preview is available, the description is rendered before it.
	 * @default `undefined`
	 */
	description?: string
}

/** Path-free image metadata collected only while Core finalizes rich shortcut previews. */
export interface ShortcutPreviewImage {
	/** Raw image bytes or text content supplied by the resolver. */
	readonly content: string
	/** MIME type describing `content`. */
	readonly mediaType: string
	/**
	 * Optional alternative text for the generated Markdown preview image.
	 * @default `undefined`
	 */
	readonly alt?: string
}

/** Documentation-only collector supplied to dynamic shortcut resolution during Typegen preview. */
export interface ShortcutPreviewCollector {
	/** Registers one path-free image for the shortcut's generated preview. */
	image: (image: ShortcutPreviewImage) => void
}

/** Optional resolution context. Runtime resolution omits it; Typegen preview supplies it. */
export interface ShortcutResolutionContext {
	/**
	 * Preview-only collector; absent during ordinary runtime resolution.
	 * @default `undefined`
	 */
	readonly preview?: ShortcutPreviewCollector
}

/** Dynamic shortcut definition with separate runtime and TypeScript input contracts. */
export interface DynamicShortcut {
	/** Pattern matched against a shortcut reference. */
	pattern: RegExp
	/** TypeScript input expression for shortcut references handled by this rule. */
	inputType: string
	/** Resolves a matched shortcut reference to one or more style items. */
	resolve: (matched: RegExpMatchArray, context?: ShortcutResolutionContext) => Awaitable<Arrayable<ResolvedStyleItem> | Nullish>
	/**
	 * Concrete shortcut references offered in Typegen autocomplete.
	 * @default `[]`
	 */
	autocomplete?: Arrayable<string>
	/**
	 * Optional authored documentation for generated concrete autocomplete members. When a resolved preview is available, the description is rendered before it.
	 * @default `undefined`
	 */
	description?: string
}

/** User-facing shortcut definition. Tuple/string shorthand forms are intentionally unsupported. */
export type Shortcut = StaticShortcut | DynamicShortcut

/** Configuration for the built-in shortcut subsystem. */
export interface ShortcutsConfig {
	/** Static and dynamic shortcut definitions available to the engine. */
	definitions: Shortcut[]
}

declare module '@pikacss/core' {
	interface EngineConfig {
		/** Shortcut definitions consumed once during Engine initialization. */
		shortcuts?: ShortcutsConfig
	}
}

interface ShortcutsState {
	definitions: Shortcut[]
	resolver?: ShortcutResolver
}

interface ShortcutDeclarationSnapshot {
	readonly explicit: readonly (readonly [name: string, documentation: TypegenDocumentation])[]
	readonly dynamicTypes: readonly string[]
}

function createStrictShortcutNamespace(definitions: readonly Shortcut[]): object {
	const staticNames = new Set(definitions.flatMap(definition => 'name' in definition ? [definition.name] : []))
	const dynamicPatterns = definitions.flatMap(definition => 'pattern' in definition ? [definition.pattern] : [])
	return new Proxy(Object.create(null) as Record<string, string>, {
		get(_target, property) {
			if (typeof property !== 'string')
				return undefined
			return staticNames.has(property) || dynamicPatterns.some(pattern => matchesRulePattern(pattern, property))
				? property
				: undefined
		},
	})
}

function snapshotShortcutDeclarations(
	definitions: readonly Shortcut[],
	documentation: ReadonlyMap<string, TypegenDocumentation> = new Map(),
	onInvalidAutocomplete: (value: string, pattern: RegExp) => void = () => {},
): ShortcutDeclarationSnapshot {
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

function renderShortcutDeclarations(snapshot: ShortcutDeclarationSnapshot, bindings: TypegenJSDocRenderBindings = {}): string {
	const lines = ['interface __PikaExplicitShortcuts {']
	for (const [name, docs] of snapshot.explicit) {
		lines.push(...renderTypegenJSDoc(docs, bindings, '  '))
		lines.push(`  ${JSON.stringify(name)}: string`)
	}
	lines.push('}')
	if (snapshot.dynamicTypes.length === 0) {
		lines.push('type __PikaShortcuts = __PikaExplicitShortcuts')
	}
	else {
		lines.push(`type __PikaDynamicShortcutInput = ${snapshot.dynamicTypes.join(' | ')}`)
		lines.push('type __PikaDynamicShortcuts = { [K in __PikaDynamicShortcutInput]: string }')
		lines.push('type __PikaShortcuts = __PikaExplicitShortcuts & __PikaDynamicShortcuts')
	}
	return lines.join('\n')
}

function resolveShortcutConfigForContext(config: Shortcut, context?: ShortcutResolutionContext) {
	if (context != null && typeof config === 'object' && config != null && !Array.isArray(config) && 'pattern' in config) {
		return resolveRuleConfig<InternalStyleItem>({
			...config,
			resolve: (matched: RegExpMatchArray) => config.resolve(matched, context),
		})
	}
	return resolveRuleConfig<InternalStyleItem>(config)
}

function createShortcutResolver(
	definitions: readonly Shortcut[],
	onDiagnostic: ConstructorParameters<typeof ShortcutResolver>[0],
	context?: ShortcutResolutionContext,
): ShortcutResolver {
	const resolver = new ShortcutResolver(onDiagnostic)
	for (const definition of definitions) {
		const resolved = resolveShortcutConfigForContext(definition, context)
		if (resolved?.type === 'static')
			resolver.addStaticRule(resolved.rule)
		else if (resolved?.type === 'dynamic')
			resolver.addDynamicRule(resolved.rule)
	}
	return resolver
}

function splitPreviewLayerSelector(selector: string[]) {
	const [first, ...rest] = selector
	if (first == null || !first.startsWith(LAYER_SELECTOR_PREFIX))
		return { layer: undefined, selector }
	const layer = first.slice(LAYER_SELECTOR_PREFIX.length)
		.trim()
	return layer.length === 0
		? { layer: undefined, selector }
		: { layer, selector: rest }
}

function renderPreviewContents(contents: readonly StyleContent[]): string {
	const blocks: CSSStyleBlocks = new Map()
	for (const { selector, property, value } of contents) {
		const renderedSelectors = selector.map(part => replaceAtomicStyleIdPlaceholder(part, 'pika-preview'))
		let current = blocks
		for (let index = 0; index < renderedSelectors.length; index++) {
			const currentSelector = renderedSelectors[index]!
			const body = current.get(currentSelector) ?? { properties: [] }
			if (index === renderedSelectors.length - 1)
				body.properties.push(...value.map(v => ({ property, value: v })))
			else
				body.children ??= new Map()
			current.set(currentSelector, body)
			if (index < renderedSelectors.length - 1)
				current = body.children!
		}
	}
	return renderCSSStyleBlocks(blocks, true)
		.trim()
}

function renderPreviewCss(
	contents: readonly StyleContent[],
	engine: Engine,
	reportedUnknownLayers: Set<string>,
): string {
	const layerOrder = Object.entries(engine.config.layers)
		.sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
		.map(([name]) => name)
	const layerGroups = new Map<string, StyleContent[]>(layerOrder.map(name => [name, []]))
	const unlayered: StyleContent[] = []
	const defaultLayer = layerGroups.has(engine.config.defaultUtilitiesLayer)
		? engine.config.defaultUtilitiesLayer
		: layerOrder.at(-1)

	for (const content of contents) {
		const { layer, selector } = splitPreviewLayerSelector(content.selector)
		if (!selector.some(hasAtomicStyleIdPlaceholder))
			continue
		const previewContent = { ...content, selector }
		if (layer != null && layerGroups.has(layer)) {
			layerGroups.get(layer)!.push(previewContent)
			continue
		}
		if (layer != null) {
			unlayered.push(previewContent)
			if (!reportedUnknownLayers.has(layer)) {
				reportedUnknownLayers.add(layer)
				engine.reportDiagnostic({
					level: 'warning',
					code: 'atomic-style-unknown-layer',
					message: `Unknown layer "${layer}" encountered in atomic style; falling back to unlayered output.`,
				})
			}
			continue
		}
		if (defaultLayer == null)
			unlayered.push(previewContent)
		else
			layerGroups.get(defaultLayer)!.push(previewContent)
	}

	const parts: string[] = []
	const unlayeredCss = renderPreviewContents(unlayered)
	if (unlayeredCss.length > 0)
		parts.push(unlayeredCss)
	for (const layer of layerOrder) {
		const css = renderPreviewContents(layerGroups.get(layer)!)
		if (css.length === 0)
			continue
		const indented = css.split('\n')
			.map(line => `  ${line}`)
			.join('\n')
		parts.push(`@layer ${layer} {\n${indented}\n}`)
	}
	return parts.join('\n')
}

function clonePreviewStyleItem<T extends InternalStyleItem>(value: T): T {
	if (typeof value !== 'object' || value == null)
		return value
	if (Array.isArray(value))
		return value.map(item => clonePreviewStyleItem(item as InternalStyleItem)) as unknown as T
	const copy: Record<string, unknown> = {}
	for (const [key, entry] of Object.entries(value)) {
		copy[key] = typeof entry === 'object' && entry != null
			? clonePreviewStyleItem(entry as InternalStyleItem)
			: entry
	}
	return copy as T
}

function collectConcreteShortcutOwners(
	definitions: readonly Shortcut[],
	onInvalidAutocomplete: (value: string, pattern: RegExp) => void,
): { concrete: string[], owners: ReadonlyMap<string, Shortcut> } {
	const staticOwners = new Map<string, StaticShortcut>()
	const dynamicOrder: string[] = []
	const dynamicOwners = new Map<string, DynamicShortcut>()
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
	const owners = new Map<string, Shortcut>()
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

async function finalizeShortcutTypegen(
	engine: Engine,
	ownerPlugin: EnginePlugin,
	definitions: readonly Shortcut[],
	onDiagnostic: (diagnostic: { level: 'warning', code: string, message: string, cause?: unknown }) => void,
): Promise<void> {
	const documentation = new Map<string, TypegenDocumentation>()
	const previewAssets: TypegenPreviewAsset[] = []
	const reportedUnknownLayers = new Set<string>()
	const { concrete, owners } = collectConcreteShortcutOwners(definitions, (value, pattern) => onDiagnostic({
		level: 'warning',
		code: 'shortcut-autocomplete-pattern-mismatch',
		message: `Shortcut autocomplete value "${value}" does not match ${pattern}`,
	}))

	let activeContext: ShortcutResolutionContext | undefined
	let resolutionFailure: unknown
	const previewContext: ShortcutResolutionContext = Object.freeze({
		get preview() {
			return activeContext?.preview
		},
	})
	const previewResolver = createShortcutResolver(definitions, (diagnostic) => {
		if (diagnostic.code === 'resolver-resolution-error') {
			resolutionFailure ??= diagnostic.cause ?? new Error(diagnostic.message)
			return
		}
		engine.reportDiagnostic(diagnostic)
	}, previewContext)
	const coreTransform = async (styleItems: InternalStyleItem[]) => {
		const result: InternalStyleItem[] = []
		for (const styleItem of styleItems) {
			if (typeof styleItem === 'string')
				result.push(...(await previewResolver.resolve(styleItem)).map(clonePreviewStyleItem))
			else
				result.push(clonePreviewStyleItem(styleItem))
		}
		return result
	}
	const transformStyleItems = (styleItems: InternalStyleItem[]) => runPreviewStyleItemPipeline(
		engine,
		ownerPlugin,
		styleItems,
		coreTransform,
	)

	for (let memberIndex = 0; memberIndex < concrete.length; memberIndex++) {
		const member = concrete[memberIndex]!
		const owner = owners.get(member)
		if (owner == null)
			continue
		const memberAssets: TypegenPreviewAsset[] = []
		const images: NonNullable<TypegenDocumentation['previewImages']>[number][] = []
		let imageIndex = 0
		const context: ShortcutResolutionContext = Object.freeze({
			preview: Object.freeze({
				image(image: ShortcutPreviewImage) {
					const assetId = `core:shortcuts:${memberIndex}:image:${imageIndex++}`
					memberAssets.push(Object.freeze({ id: assetId, content: image.content, mediaType: image.mediaType }))
					images.push(Object.freeze({ assetId, ...(image.alt == null ? {} : { alt: image.alt }) }))
				},
			}),
		})
		let previewCss: string | undefined
		resolutionFailure = undefined
		activeContext = context
		previewResolver.resetResolutionCache()
		try {
			const contents = await preparePreviewUse(engine, [member], transformStyleItems)
			if (resolutionFailure != null)
				throw resolutionFailure
			previewCss = renderPreviewCss(contents, engine, reportedUnknownLayers) || undefined
			previewAssets.push(...memberAssets)
		}
		catch (cause) {
			onDiagnostic({
				level: 'warning',
				code: 'shortcut-preview-resolution-error',
				message: `Failed to render Typegen preview for shortcut "${member}": ${cause instanceof Error ? cause.message : String(cause)}`,
				cause,
			})
			images.length = 0
		}
		finally {
			activeContext = undefined
		}
		documentation.set(member, Object.freeze({
			description: owner.description,
			...(previewCss == null ? {} : { previewCss }),
			...(images.length === 0 ? {} : { previewImages: Object.freeze([...images]) }),
		}))
	}

	const declarationSnapshot = snapshotShortcutDeclarations(definitions, documentation)
	const render = (bindings: TypegenJSDocRenderBindings) => renderShortcutDeclarations(declarationSnapshot, bindings)
	setCoreGeneratedTypegenContribution(engine.typegen, 'core:shortcuts', {
		declarations: render({}),
		renderDeclarations: render,
		previewAssets,
	})
}

/** Built-in shortcut subsystem. Effective raw config is its only semantic ingress. */
export function shortcuts() {
	const plugin = defineEnginePlugin({
		name: 'core:shortcuts',
		createState: (): ShortcutsState => ({ definitions: [] }),
		rawConfigConfigured(config, context) {
			context.state.definitions = config.shortcuts?.definitions ?? []
		},
		configureEngine(configurator) {
			const acceptedDefinitions = configurator.state.definitions
				.filter(definition => resolveShortcutConfig(definition) != null)
			const resolver = createShortcutResolver(acceptedDefinitions, configurator.onDiagnostic)
			configurator.state.definitions = acceptedDefinitions
			configurator.state.resolver = resolver

			configurator.pika.extendStatic('sc', createStrictShortcutNamespace(acceptedDefinitions))
			const declarationSnapshot = snapshotShortcutDeclarations(acceptedDefinitions)
			configurator.typegen.add({
				id: 'core:shortcuts',
				// Final concrete documentation is rebuilt by the Core-private
				// finalizer after higher-level plugins finish Engine configuration.
				declarations: renderShortcutDeclarations(declarationSnapshot),
				pika: { sc: '__PikaShortcuts' },
			})
			registerCoreEngineFinalizer(configurator.runtime, () => finalizeShortcutTypegen(
				configurator.runtime,
				plugin,
				acceptedDefinitions,
				configurator.onDiagnostic,
			))
		},
		async transformStyleItems(styleItems, context) {
			const resolver = context.state.resolver
			if (resolver == null)
				return styleItems
			const result: InternalStyleItem[] = []
			for (const styleItem of styleItems) {
				if (typeof styleItem === 'string') {
					result.push(...await resolver.resolve(styleItem))
					continue
				}
				result.push(styleItem)
			}
			return result
		},
	})
	return plugin
}

class ShortcutResolver extends RecursiveResolver<InternalStyleItem> {
	resetResolutionCache(): void {
		this._resolvedResultsMap.clear()
		this._unmatchedStrings.clear()
	}
}

/** @internal */
export function resolveShortcutConfig(config: Shortcut) {
	return resolveShortcutConfigForContext(config)
}
