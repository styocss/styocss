import { createEventHook, isNotNullish, numberToChars, serialize } from './utils'
import type { AddedAtomicStyle, AtomicStyleContent, StyleItem, StyleObj } from './types'
import { SelectorResolver, type ShortcutPartial, ShortcutResolver } from './resolvers'
import { ATOMIC_STYLE_NAME_PLACEHOLDER, ATOMIC_STYLE_NAME_PLACEHOLDER_RE_GLOBAL } from './constants'
import type { StyleObjExtractor } from './extractor'
import { createStyleObjExtractor } from './extractor'
import { type EngineConfig, type ResolvedEngineConfig, resolveEngineConfig } from './config'

function getAtomicStyleName({
	content,
	prefix,
	stored,
}: {
	content: AtomicStyleContent
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

function optimizeAtomicStyleContents(list: AtomicStyleContent[]) {
	const map = new Map<string, AtomicStyleContent>()
	list.forEach((content) => {
		const key = serialize([content.selector, content.property])
		const existedItem = map.get(key)
		if (existedItem == null) {
			map.set(key, content)
			return
		}
		if (content.value == null) {
			map.delete(key)
			return
		}

		// Make the override value to be the last one
		map.delete(key)
		map.set(key, content)
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
	stored: Map<string, AtomicStyleContent[]>
	resolveShortcut: (shortcut: string) => ShortcutPartial[]
	extractStyleObj: (styleObj: StyleObj) => AtomicStyleContent[]
}) {
	const unknown = new Set<string>()
	const list: AtomicStyleContent[] = []
	itemList.forEach((styleItem) => {
		if (typeof styleItem === 'string') {
			const shortcut: string = styleItem
			const cached = stored.get(shortcut)
			if (cached != null) {
				list.push(...cached)
				return
			}

			const shortcutAtomicStyleContentList: AtomicStyleContent[] = []
			resolveShortcut(shortcut)
				.forEach((partial) => {
					if (typeof partial === 'string') {
						unknown.add(partial)
						return
					}
					shortcutAtomicStyleContentList.push(...extractStyleObj(partial))
				})
			stored.set(shortcut, shortcutAtomicStyleContentList)
			list.push(...shortcutAtomicStyleContentList)
		}
		else {
			const styleObj: StyleObj = styleItem
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
	atomicStyles,
	isPreview,
}: {
	atomicStyles: AddedAtomicStyle[]
	isPreview: boolean
}) {
	const renderBlocks: RenderBlocks = new Map()
	atomicStyles.forEach(({ name, content: { selector, property, value } }) => {
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

function renderAtomicStyles(payload: { atomicStyles: AddedAtomicStyle[], isPreview: boolean }) {
	const blocks = prepareRenderBlocks(payload)
	return renderBlocks(blocks)
}

export class Engine<
	Selector extends string = string,
	Shortcut extends string = string,
> {
	config: ResolvedEngineConfig

	selectorResolver: SelectorResolver
	shortcutResolver: ShortcutResolver
	styleObjExtractor: StyleObjExtractor

	cached = {
		atomicNames: new Map<string, string>(),
		atomicStyles: new Map<string, AddedAtomicStyle>(),
		shortcuts: new Map<string, AtomicStyleContent[]>(),
	}

	hooks = {
		atomicStyleAdded: createEventHook<AddedAtomicStyle>(),
	}

	constructor(config: EngineConfig = {}) {
		this.config = resolveEngineConfig(config)
		const {
			selectors,
			shortcuts,
		} = this.config

		this.selectorResolver = new SelectorResolver()
		this.shortcutResolver = new ShortcutResolver()
		this.styleObjExtractor = createStyleObjExtractor({
			defaultSelector: this.config.defaultSelector,
			resolveSelector: selector => this.selectorResolver.resolve(selector),
			resolveShortcut: shortcut => this.shortcutResolver.resolve(shortcut),
		})

		selectors.static.forEach(rule => this.selectorResolver.addStaticRule(rule))
		selectors.dynamic.forEach(rule => this.selectorResolver.addDynamicRule(rule))
		shortcuts.static.forEach(rule => this.shortcutResolver.addStaticRule(rule))
		shortcuts.dynamic.forEach(rule => this.shortcutResolver.addDynamicRule(rule))
	}

	use(...itemList: [StyleItem<Selector, Shortcut>, ...StyleItem<Selector, Shortcut>[]]): string[]
	use(...itemList: StyleItem[]): string[] {
		const {
			unknown,
			contents,
		} = resolveStyleItemList({
			itemList,
			stored: this.cached.shortcuts,
			resolveShortcut: shortcut => this.shortcutResolver.resolve(shortcut),
			extractStyleObj: styleObj => this.styleObjExtractor.extract(styleObj),
		})
		const resolvedNames: string[] = []
		contents.forEach((content) => {
			const name = getAtomicStyleName({
				content,
				prefix: this.config.prefix,
				stored: this.cached.atomicNames,
			})
			resolvedNames.push(name)
			if (!this.cached.atomicStyles.has(name)) {
				const registered = {
					name,
					content,
				}
				this.cached.atomicStyles.set(
					name,
					registered,
				)
				this.hooks.atomicStyleAdded.trigger(registered)
			}
		})
		return [...unknown, ...resolvedNames]
	}

	previewStyles(...itemList: [StyleItem<Selector, Shortcut>, ...StyleItem<Selector, Shortcut>[]]) {
		const nameList = this.use(...itemList)
		const targets = nameList.map(name => this.cached.atomicStyles.get(name)).filter(isNotNullish)
		return renderAtomicStyles({
			atomicStyles: targets,
			isPreview: true,
		})
	}

	renderStyles() {
		const renderedAtomicStyles = renderAtomicStyles({
			atomicStyles: [...this.cached.atomicStyles.values()],
			isPreview: false,
		})
		const result = (
			renderedAtomicStyles === ''
				? []
				: [
						'\n/* StyoCSS Start */\n',
						renderedAtomicStyles,
						'\n/* StyoCSS End */\n',
					]
		).join('').trim()
		return result
	}
}

export function createEngine(config?: EngineConfig) {
	return new Engine(config)
}
