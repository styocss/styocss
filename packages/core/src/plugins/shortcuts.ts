import type { Engine } from '../engine'
import type { TypegenJSDocRenderBindings } from '../typegen/jsdoc'
import type { TypegenDocumentation, TypegenPreviewAsset } from '../typegen/snapshot'
import type { Arrayable, Awaitable, CSSStyleBlocks, InternalStyleItem, Nullish, ResolvedStyleItem, StyleContent } from '../types'
import { LAYER_SELECTOR_PREFIX, replaceAtomicStyleIdPlaceholder } from '../constants'
import { registerCoreEngineFinalizer } from '../finalization'
import { defineEnginePlugin } from '../plugin'
import { matchesRulePattern, RecursiveResolver, resolveRuleConfig } from '../resolver'
import { renderTypegenJSDoc } from '../typegen/jsdoc'
import { setCoreGeneratedTypegenContribution } from '../typegen/registry'
import { renderCSSStyleBlocks } from '../utils'

/** Static shortcut definition in the frozen object-only authoring grammar. */
export interface StaticShortcut {
	/** Name used to reference the shortcut in a `pika()` call. */
	name: string
	/** Style items expanded when the named shortcut is resolved. */
	value: Arrayable<ResolvedStyleItem>
	/**
	 * Documentation rendered for the generated Typegen shortcut member.
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
	 * Documentation rendered for generated Typegen shortcut members.
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

function renderShortcutDeclarations(
	definitions: readonly Shortcut[],
	onInvalidAutocomplete: (value: string, pattern: RegExp) => void,
	documentation: ReadonlyMap<string, TypegenDocumentation> = new Map(),
	bindings: TypegenJSDocRenderBindings = {},
): string {
	const explicit = new Map<string, TypegenDocumentation>()
	const dynamicTypes: string[] = []
	for (const definition of definitions) {
		if ('name' in definition) {
			explicit.set(definition.name, { description: definition.description })
			continue
		}
		dynamicTypes.push(definition.inputType)
		for (const value of [definition.autocomplete ?? []].flat()) {
			if (!matchesRulePattern(definition.pattern, value)) {
				onInvalidAutocomplete(value, definition.pattern)
				continue
			}
			explicit.set(value, documentation.get(value) ?? { description: definition.description })
		}
	}

	const lines = ['interface __PikaExplicitShortcuts {']
	for (const [name, docs] of [...explicit].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
		lines.push(...renderTypegenJSDoc(docs, bindings, '  '))
		lines.push(`  ${JSON.stringify(name)}: string`)
	}
	lines.push('}')
	if (dynamicTypes.length === 0) {
		lines.push('type __PikaShortcuts = __PikaExplicitShortcuts')
	}
	else {
		lines.push(`type __PikaDynamicShortcutInput = ${dynamicTypes.join(' | ')}`)
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

function renderPreviewCss(contents: readonly StyleContent[]): string {
	if (contents.length === 0)
		return ''
	const blocks: CSSStyleBlocks = new Map()
	for (const { selector: rawSelector, property, value } of contents) {
		const selector = [...rawSelector]
		if (selector[0]?.startsWith(LAYER_SELECTOR_PREFIX)) {
			const layer = selector.shift()!.slice(LAYER_SELECTOR_PREFIX.length)
				.trim()
			if (layer.length > 0)
				selector.unshift(`@layer ${layer}`)
		}
		const renderedSelectors = selector.map(part => replaceAtomicStyleIdPlaceholder(part, 'pika-preview'))
		if (renderedSelectors.length === 0)
			continue
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

async function finalizeShortcutTypegen(
	engine: Engine,
	definitions: readonly Shortcut[],
	onDiagnostic: (diagnostic: { level: 'warning', code: string, message: string, cause?: unknown }) => void,
): Promise<void> {
	const documentation = new Map<string, TypegenDocumentation>()
	const previewAssets: TypegenPreviewAsset[] = []
	const concreteSet = new Set<string>()
	for (const definition of definitions) {
		if ('pattern' in definition === false)
			continue
		for (const value of [definition.autocomplete ?? []].flat()) {
			if (!matchesRulePattern(definition.pattern, value)) {
				onDiagnostic({
					level: 'warning',
					code: 'shortcut-autocomplete-pattern-mismatch',
					message: `Shortcut autocomplete value "${value}" does not match ${definition.pattern}`,
				})
				continue
			}
			concreteSet.add(value)
		}
	}
	const concrete = [...concreteSet].sort()

	for (let memberIndex = 0; memberIndex < concrete.length; memberIndex++) {
		const member = concrete[memberIndex]!
		const owner = definitions.find(definition => 'pattern' in definition && matchesRulePattern(definition.pattern, member))
		if (owner == null)
			continue
		const images: NonNullable<TypegenDocumentation['previewImages']>[number][] = []
		let imageIndex = 0
		const context: ShortcutResolutionContext = Object.freeze({
			preview: Object.freeze({
				image(image: ShortcutPreviewImage) {
					const assetId = `core:shortcuts:${memberIndex}:image:${imageIndex++}`
					previewAssets.push(Object.freeze({ id: assetId, content: image.content, mediaType: image.mediaType }))
					images.push(Object.freeze({ assetId, ...(image.alt == null ? {} : { alt: image.alt }) }))
				},
			}),
		})
		let previewCss: string | undefined
		try {
			let resolutionFailure: unknown
			const previewResolver = createShortcutResolver(definitions, (diagnostic) => {
				if (diagnostic.code === 'resolver-resolution-error') {
					resolutionFailure ??= diagnostic.cause ?? new Error(diagnostic.message)
					return
				}
				engine.reportDiagnostic(diagnostic)
			}, context)
			const resolved = await previewResolver.resolve(member)
			if (resolutionFailure != null)
				throw resolutionFailure
			const styleItems = resolved.filter((item): item is Exclude<ResolvedStyleItem, string> => typeof item !== 'string')
			if (styleItems.length > 0) {
				const plan = await engine.prepareUse(...styleItems)
				previewCss = renderPreviewCss(plan.contents) || undefined
			}
		}
		catch (cause) {
			onDiagnostic({
				level: 'warning',
				code: 'shortcut-preview-resolution-error',
				message: `Failed to render Typegen preview for shortcut "${member}": ${cause instanceof Error ? cause.message : String(cause)}`,
				cause,
			})
		}
		documentation.set(member, Object.freeze({
			description: owner.description,
			...(previewCss == null ? {} : { previewCss }),
			...(images.length === 0 ? {} : { previewImages: Object.freeze(images) }),
		}))
	}

	const render = (bindings: TypegenJSDocRenderBindings) => renderShortcutDeclarations(definitions, () => {}, documentation, bindings)
	setCoreGeneratedTypegenContribution(engine.typegen, 'core:shortcuts', {
		declarations: render({}),
		renderDeclarations: render,
		previewAssets,
	})
}

/** Built-in shortcut subsystem. Effective raw config is its only semantic ingress. */
export function shortcuts() {
	return defineEnginePlugin({
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
			configurator.typegen.add({
				id: 'core:shortcuts',
				// Final concrete documentation is rebuilt by the Core-private
				// finalizer after higher-level plugins finish Engine configuration.
				declarations: renderShortcutDeclarations(acceptedDefinitions, () => {}),
				pika: { sc: '__PikaShortcuts' },
			})
			registerCoreEngineFinalizer(configurator.runtime, () => finalizeShortcutTypegen(
				configurator.runtime,
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
}

class ShortcutResolver extends RecursiveResolver<InternalStyleItem> {}

/** @internal */
export function resolveShortcutConfig(config: Shortcut) {
	return resolveShortcutConfigForContext(config)
}
