import {
	createEventHook,
	isArray,
	isNotNullish,
	numberToAlphabets,
	wrapWithSelector,
} from './utils'

import type {
	AddedAtomicStyle,
	AtomicStyleContent,
	CommonConfig,
	ResolvedCommonConfig,
	ResolvedStyoEngineConfig,
	StyleItem,
	StyoEngineConfig,
} from './types'

import { SelectorAliasResolver } from './SelectorAliasResolver'
import { ShortcutResolver } from './ShortcutResolver'
import {
	ATOMIC_STYLE_NAME_PLACEHOLDER,
	ATOMIC_STYLE_NAME_PLACEHOLDER_RE_GLOBAL,
} from './constants'
import { StyleObjExtractor } from './StyleObjExtractor'

class StyoEngine<
	AliasForSelector extends string = string,
	Shortcut extends string = string,
> {
	private _config: StyoEngineConfig
	private _prefix: string
	private _defaultSelector: string

	private _aliasForSelectorResolver: SelectorAliasResolver = new SelectorAliasResolver()
	private _shortcutResolver: ShortcutResolver = new ShortcutResolver()
	private _styleObjExtractor: StyleObjExtractor

	private _cachedAtomicStyleName = new Map<string, string>()
	private _cachedShortcutToAtomicStyleContentListMap = new Map<string, AtomicStyleContent[]>()
	private _atomicStylesMap = new Map<string, AddedAtomicStyle>()

	hooks = {
		atomicStyleAdded: createEventHook<AddedAtomicStyle>(),
	}

	constructor(config?: StyoEngineConfig) {
		this._config = config || {}
		const {
			prefix,
			defaultSelector,
			selectors,
			shortcuts,
		} = resolveStyoEngineConfig(this._config)

		this._prefix = prefix
		this._defaultSelector = defaultSelector

		selectors.static.forEach(rule => this._aliasForSelectorResolver.addStaticAliasRule(rule))
		selectors.dynamic.forEach(rule => this._aliasForSelectorResolver.addDynamicAliasRule(rule))
		shortcuts.static.forEach(rule => this._shortcutResolver.addStaticShortcutRule(rule))
		shortcuts.dynamic.forEach(rule => this._shortcutResolver.addDynamicShortcutRule(rule))

		this._styleObjExtractor = new StyleObjExtractor({
			defaultSelector: this._defaultSelector,
			resolveAliasForSelector: alias => this._aliasForSelectorResolver.resolveAlias(alias),
		})
	}

	private _getAtomicStyleName(content: AtomicStyleContent) {
		const key = serializeAtomicStyleContent(content)
		const cached = this._cachedAtomicStyleName.get(key)
		if (cached != null)
			return cached

		const num = this._cachedAtomicStyleName.size
		const name = `${this.prefix}${numberToAlphabets(num)}`
		this._cachedAtomicStyleName.set(key, name)
		return name
	}

	private _resolveStyleItemList(itemList: StyleItem[]) {
		const atomicStyleContentList: AtomicStyleContent[] = []
		itemList.forEach((styleItem) => {
			if (typeof styleItem === 'string') {
				const cached = this._cachedShortcutToAtomicStyleContentListMap.get(styleItem)
				if (cached != null) {
					atomicStyleContentList.push(...cached)
					return
				}

				const shortcutAtomicStyleContentList: AtomicStyleContent[] = []
				this._shortcutResolver
					.resolveShortcut(styleItem)
					.forEach((styleObj) => {
						shortcutAtomicStyleContentList.push(...this._styleObjExtractor.extract(styleObj))
					})
				this._cachedShortcutToAtomicStyleContentListMap.set(styleItem, shortcutAtomicStyleContentList)
				atomicStyleContentList.push(...shortcutAtomicStyleContentList)
			}
			else {
				atomicStyleContentList.push(...this._styleObjExtractor.extract(styleItem))
			}
		})
		return optimizeAtomicStyleContentList(atomicStyleContentList)
	}

	private _renderAtomicStyles(previewList: string[] = []): string {
		const isPreviewMode = previewList.length > 0

		const groupedRenderObjects = new Map<string, { selector: string[], content: string[] }>()
		;(
			isPreviewMode
				? (previewList.map(name => this.atomicStylesMap.get(name)).filter(isNotNullish))
				: [...this.atomicStylesMap.values()]
		)
			.forEach(({
				name,
				content: { selector, property, value },
			}) => {
				const isValidSelector = selector.some(s => s.includes(ATOMIC_STYLE_NAME_PLACEHOLDER))
				if (isValidSelector === false || value == null)
					return

				const renderObject = {
					selector: isPreviewMode
						? selector
						: selector.map(s => s.replace(ATOMIC_STYLE_NAME_PLACEHOLDER_RE_GLOBAL, name)),
					content: isArray(value)
						? value.map(value => `${property}:${value}`).join(';')
						: `${property}:${value}`,
				}

				const key = JSON.stringify(renderObject.selector)
				const item = groupedRenderObjects.get(key) || { selector: renderObject.selector, content: [] }
				item.content.push(renderObject.content)
				groupedRenderObjects.set(key, item)
			})

		return Array.from(groupedRenderObjects.values(), ({ selector, content }) => wrapWithSelector(selector, content.join(';'))).join('')
	}

	get config() {
		return this._config
	}

	get prefix() {
		return this._prefix
	}

	get defaultSelector() {
		return this._defaultSelector
	}

	get staticAliasForSelectorRuleList() {
		return this._aliasForSelectorResolver.staticAliasRuleList
	}

	get dynamicAliasForSelectorRuleList() {
		return this._aliasForSelectorResolver.dynamicAliasRuleList
	}

	get staticShortcutRuleList() {
		return this._shortcutResolver.staticShortcutRuleList
	}

	get dynamicShortcutRuleList() {
		return this._shortcutResolver.dynamicShortcutRuleList
	}

	get atomicStylesMap() {
		return new Map(this._atomicStylesMap)
	}

	// TODO: implement warning

	styo(...itemList: [StyleItem<AliasForSelector, Shortcut>, ...StyleItem<AliasForSelector, Shortcut>[]]) {
		const atomicStyleContentList = this._resolveStyleItemList(itemList as StyleItem[])
		const atomicStyleNameList: string[] = []
		atomicStyleContentList.forEach((content) => {
			const name = this._getAtomicStyleName(content)
			atomicStyleNameList.push(name)
			if (!this._atomicStylesMap.has(name)) {
				const registered = {
					name,
					content,
				}
				this._atomicStylesMap.set(
					name,
					registered,
				)
				this.hooks.atomicStyleAdded.trigger(registered)
			}
		})
		return atomicStyleNameList
	}

	previewStyo(...itemList: [StyleItem<AliasForSelector, Shortcut>, ...StyleItem<AliasForSelector, Shortcut>[]]) {
		const nameList = this.styo(...itemList)
		return this._renderAtomicStyles(nameList)
	}

	renderStyles() {
		const renderedAtomicStyles = this._renderAtomicStyles()
		const result = (
			renderedAtomicStyles === ''
				? []
				: [
						'\n/* StyoCSS Atomic Styles Start */\n',
						renderedAtomicStyles,
						'\n/* StyoCSS Atomic Styles End */\n',
					]
		).join('').trim()
		return result
	}
}

function resolveCommonConfig(config: CommonConfig): ResolvedCommonConfig {
	const resolvedConfig: ResolvedCommonConfig = {
		selectors: {
			static: [],
			dynamic: [],
		},
		shortcuts: {
			static: [],
			dynamic: [],
		},
	}

	const {
		presets = [],
		selectors: {
			static: staticSelectors = [],
			dynamic: dynamicSelectors = [],
		} = {},
		shortcuts: {
			static: staticShortcuts = [],
			dynamic: dynamicShortcuts = [],
		} = {},
	} = config

	presets.forEach((preset) => {
		const resolvedPresetConfig = resolveCommonConfig(preset)
		resolvedConfig.selectors.static.push(...resolvedPresetConfig.selectors.static)
		resolvedConfig.selectors.dynamic.push(...resolvedPresetConfig.selectors.dynamic)
		resolvedConfig.shortcuts.static.push(...resolvedPresetConfig.shortcuts.static)
		resolvedConfig.shortcuts.dynamic.push(...resolvedPresetConfig.shortcuts.dynamic)
	})

	resolvedConfig.selectors.static.push(...staticSelectors)
	resolvedConfig.selectors.dynamic.push(...dynamicSelectors)
	resolvedConfig.shortcuts.static.push(...staticShortcuts)
	resolvedConfig.shortcuts.dynamic.push(...dynamicShortcuts)

	return resolvedConfig
}

function resolveStyoEngineConfig(config: StyoEngineConfig): ResolvedStyoEngineConfig {
	const {
		prefix = '',
		defaultSelector = `.${ATOMIC_STYLE_NAME_PLACEHOLDER}`,
		...commonConfig
	} = config

	const resolvedCommonConfig = resolveCommonConfig(commonConfig)

	return {
		prefix,
		defaultSelector,
		...resolvedCommonConfig,
	}
}

function serializeAtomicStyleContentWithoutValue({ selector, property }: AtomicStyleContent) {
	return JSON.stringify([selector, property])
}

function serializeAtomicStyleContent({ selector, property, value }: AtomicStyleContent) {
	return JSON.stringify([selector, property, value])
}

function optimizeAtomicStyleContentList(list: AtomicStyleContent[]) {
	const map = new Map<string, AtomicStyleContent>()
	list.forEach((content) => {
		const key = serializeAtomicStyleContentWithoutValue(content)
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

export {
	StyoEngine,
}
