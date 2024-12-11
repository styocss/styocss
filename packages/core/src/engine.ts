import { createEventHook, isNotNullish, numberToChars, serialize } from './utils'
import type { AtomicRule, AtomicRuleContent, Autocomplete, ExtractedAtomicRuleContent, StyleDefinition, StyleItem } from './types'
import { SelectorResolver, ShortcutResolver } from './resolvers'
import { ATOMIC_STYLE_NAME_PLACEHOLDER, ATOMIC_STYLE_NAME_PLACEHOLDER_RE_GLOBAL } from './constants'
import type { StyleDefinitionExtractor } from './extractor'
import { createStyleDefinitionExtractor } from './extractor'
import { type EngineConfig, type PreflightFn, type ResolvedEngineConfig, resolveEngineConfig } from './config'
import { executePlugins, resolvePlugins } from './plugin'

export async function createEngine<Autocomplete_ extends Autocomplete = Autocomplete>(config: EngineConfig<Autocomplete_> = {}): Promise<Engine<Autocomplete_>> {
	await executePlugins<Autocomplete_>(
		await resolvePlugins<Autocomplete_>(config.plugins ?? []),
		'config',
		config,
	)

	const resolvedConfig = await resolveEngineConfig<Autocomplete_>(config)

	await executePlugins<Autocomplete_>(
		resolvedConfig.plugins,
		'configResolved',
		resolvedConfig,
	)

	return new Engine<Autocomplete_>(resolvedConfig)
}

export class Engine<Autocomplete_ extends Autocomplete = Autocomplete> {
	config: ResolvedEngineConfig<Autocomplete_>

	selectorResolver: SelectorResolver
	shortcutResolver: ShortcutResolver
	styleObjExtractor: StyleDefinitionExtractor

	store = {
		atomicNames: new Map<string, string>(),
		atomicRules: new Map<string, AtomicRule>(),
		shortcuts: new Map<string, AtomicRuleContent[]>(),
	}

	hooks = {
		atomicStyleAdded: createEventHook<AtomicRule>(),
	}

	constructor(config: ResolvedEngineConfig<Autocomplete_>) {
		this.config = config
		const {
			selectors,
			shortcuts,
		} = this.config

		this.selectorResolver = new SelectorResolver()
		this.shortcutResolver = new ShortcutResolver()
		this.styleObjExtractor = createStyleDefinitionExtractor({
			defaultSelector: this.config.defaultSelector,
			resolveSelector: selector => this.selectorResolver.resolve(selector),
			resolveShortcut: shortcut => this.shortcutResolver.resolve(shortcut),
		})

		selectors.forEach(selector => selector.type === 'static'
			? this.selectorResolver.addStaticRule(selector.rule)
			: this.selectorResolver.addDynamicRule(selector.rule))

		shortcuts.forEach(shortcut => shortcut.type === 'static'
			? this.shortcutResolver.addStaticRule(shortcut.rule)
			: this.shortcutResolver.addDynamicRule(shortcut.rule))
	}

	use(...itemList: StyleItem<Autocomplete_>[]): string[] {
		const {
			unknown,
			contents,
		} = resolveStyleItemList({
			itemList,
			stored: this.store.shortcuts,
			resolveShortcut: shortcut => this.shortcutResolver.resolve(shortcut),
			extractStyleObj: styleObj => this.styleObjExtractor.extract(styleObj),
		})
		const resolvedNames: string[] = []
		contents.forEach((content) => {
			const name = getAtomicStyleName({
				content,
				prefix: this.config.prefix,
				stored: this.store.atomicNames,
			})
			resolvedNames.push(name)
			if (!this.store.atomicRules.has(name)) {
				const registered = {
					name,
					content,
				}
				this.store.atomicRules.set(
					name,
					registered,
				)
				this.hooks.atomicStyleAdded.trigger(registered)
			}
		})
		return [...unknown, ...resolvedNames]
	}

	previewStyles(...itemList: StyleItem[]) {
		const nameList = this.use(...itemList)
		const targets = nameList.map(name => this.store.atomicRules.get(name)).filter(isNotNullish)
		return renderAtomicRules({
			atomicRules: targets,
			isPreview: true,
		})
	}

	renderStyles() {
		const renderedPreflights = renderPreflights<Autocomplete_>({
			preflights: this.config.preflights,
			engine: this,
		})
		const renderedAtomicRules = renderAtomicRules({
			atomicRules: [...this.store.atomicRules.values()],
			isPreview: false,
		})
		const result = (
			renderedAtomicRules === ''
				? []
				: [
						'\n/* StyoCSS Start */\n',
						renderedPreflights,
						renderedAtomicRules,
						'\n/* StyoCSS End */\n',
					]
		).join('').trim()
		return result
	}
}

function getAtomicStyleName({
	content,
	prefix,
	stored,
}: {
	content: AtomicRuleContent
	prefix: string
	stored: Map<string, string>
}) {
	const key = serialize([content.selector, content.property, content.value])
	const cached = stored.get(key)
	if (cached != null)
		return cached

	const num = stored.size
	const name = `${prefix}${numberToChars(num)}`
	stored.set(key, name)
	return name
}

function optimizeAtomicStyleContents(list: ExtractedAtomicRuleContent[]) {
	const map = new Map<string, AtomicRuleContent>()
	list.forEach((content) => {
		const key = serialize([content.selector, content.property])

		map.delete(key)

		if (content.value == null)
			return

		map.set(key, content as AtomicRuleContent)
	})
	return [...map.values()]
}

function resolveStyleItemList({
	itemList,
	stored,
	resolveShortcut,
	extractStyleObj,
}: {
	itemList: StyleItem[]
	stored: Map<string, AtomicRuleContent[]>
	resolveShortcut: (shortcut: string) => StyleItem[]
	extractStyleObj: (styleObj: StyleDefinition) => ExtractedAtomicRuleContent[]
}) {
	const unknown = new Set<string>()
	const list: ExtractedAtomicRuleContent[] = []
	itemList.forEach((styleItem) => {
		if (typeof styleItem === 'string') {
			const shortcut: string = styleItem
			const cached = stored.get(shortcut)
			if (cached != null) {
				list.push(...cached)
				return
			}

			const listOfShortcut: ExtractedAtomicRuleContent[] = []
			resolveShortcut(shortcut)
				.forEach((partial) => {
					if (typeof partial === 'string') {
						unknown.add(partial)
						return
					}
					listOfShortcut.push(...extractStyleObj(partial))
				})
			const optimized = optimizeAtomicStyleContents(listOfShortcut)
			stored.set(shortcut, optimized)
			list.push(...optimized)
		}
		else {
			const styleObj: StyleDefinition = styleItem
			list.push(...extractStyleObj(styleObj))
		}
	})
	return {
		unknown,
		contents: optimizeAtomicStyleContents(list),
	}
}

interface RenderBlock {
	content: string[]
	children?: RenderBlocks
}

type RenderBlocks = Map<string, RenderBlock>

function prepareRenderBlocks({
	atomicRules,
	isPreview,
}: {
	atomicRules: AtomicRule[]
	isPreview: boolean
}) {
	const renderBlocks: RenderBlocks = new Map()
	atomicRules.forEach(({ name, content: { selector, property, value } }) => {
		const isValidSelector = selector.some(s => s.includes(ATOMIC_STYLE_NAME_PLACEHOLDER))
		if (isValidSelector === false || value == null)
			return

		const renderObject = {
			selector: isPreview
			// keep the placeholder
				? selector
			// replace the placeholder with the real name
				: selector.map(s => s.replace(ATOMIC_STYLE_NAME_PLACEHOLDER_RE_GLOBAL, name)),
			content: Array.isArray(value)
			// fallback values
				? value.map(v => `${property}:${v}`).join(';')
			// single value
				: `${property}:${value}`,
		}

		let currentBlocks = renderBlocks
		for (let i = 0; i < renderObject.selector.length; i++) {
			const s = renderObject.selector[i]!
			const block = currentBlocks.get(s) || { content: [] }

			const isLast = i === renderObject.selector.length - 1
			if (isLast) {
				block.content.push(renderObject.content)
			}
			else {
				block.children ||= new Map()
			}

			currentBlocks.set(s, block)

			if (isLast === false)
				currentBlocks = block.children!
		}
	})
	return renderBlocks
}

function renderBlocks(blocks: RenderBlocks) {
	let rendered = ''
	blocks.forEach((block, selector) => {
		rendered += `${selector}{${block.content.join(';')}`
		if (block.children != null)
			rendered += renderBlocks(block.children)
		rendered += '}'
	})
	return rendered
}

function renderAtomicRules(payload: { atomicRules: AtomicRule[], isPreview: boolean }) {
	const blocks = prepareRenderBlocks(payload)
	return renderBlocks(blocks)
}

function renderPreflights<Autocomplete_ extends Autocomplete = Autocomplete>({
	preflights,
	engine,
}: {
	preflights: PreflightFn<Autocomplete_>[]
	engine: Engine<Autocomplete_>
}) {
	return preflights.map<string>(p => p(engine)).join('')
}
