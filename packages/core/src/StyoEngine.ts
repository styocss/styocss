import {
	createEventHook,
	isArray,
	isNotNullish,
	numberToAlphabets,
	wrapWithNesting,
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
	AliasForNesting extends string = string,
	AliasForSelector extends string = string,
	Shortcut extends string = string,
> {
	private _config: StyoEngineConfig
	private _prefix: string
	private _defaultSelector: string[]
	private _defaultImportant: boolean

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
			defaultImportant,
			aliasForSelectorConfigList,
			shortcutConfigList,
		} = resolveStyoEngineConfig(this._config)

		this._prefix = prefix
		this._defaultSelector = defaultSelector
		this._defaultImportant = defaultImportant

		aliasForSelectorConfigList.forEach((theConfig) => {
			if (theConfig.type === 'static') {
				const { type: _, ...rule } = theConfig
				this._aliasForSelectorResolver.addStaticAliasRule(rule)
			}
			else if (theConfig.type === 'dynamic') {
				const {
					type: _,
					predefined = [],
					...rest
				} = theConfig
				const rule = {
					predefined,
					...rest,
				}
				this._aliasForSelectorResolver.addDynamicAliasRule(rule)
			}
		})
		shortcutConfigList.forEach((theConfig) => {
			if (theConfig.type === 'static') {
				const { type: _, ...rule } = theConfig
				this._shortcutResolver.addStaticShortcutRule(rule)
			}
			else if (theConfig.type === 'dynamic') {
				const {
					type: _,
					predefined = [],
					...rest
				} = theConfig
				const rule = {
					predefined,
					...rest,
				}
				this._shortcutResolver.addDynamicShortcutRule(rule)
			}
		})

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
		// Render atomic rules
		const renderObjects = (
			isPreviewMode
				? (previewList.map(name => this.atomicStylesMap.get(name)).filter(isNotNullish))
				: [...this.atomicStylesMap.values()]
		)
			.map(({
				name,
				content: { selector, property, value },
			}) => {
				if (
					!selector.includes(ATOMIC_STYLE_NAME_PLACEHOLDER)
					|| value == null
				) {
					return null
				}

				const renderObject = {
					nesting,
					selector: isPreviewMode
						? selector
						: selector.replace(ATOMIC_STYLE_NAME_PLACEHOLDER_RE_GLOBAL, name),
					content: isArray(value)
						? value.map(value => `${property}:${value}${important ? ' !important' : ''}`).join(';')
						: `${property}:${value}${important ? ' !important' : ''}`,
				}

				return renderObject
			})
			.filter(isNotNullish)
		const groupedByNestingMap = new Map</* key */ string, [levels: string[], map: Map</* content */ string, /* selectorList */ string[]>]>()
		renderObjects.forEach(({ content, nesting, selector }) => {
			const key = JSON.stringify(nesting)
			const tuple = groupedByNestingMap.get(key) || [nesting, new Map<string, string[]>()]
			const nestingMap = tuple[1]
			const selectorList = nestingMap.get(content) || []
			selectorList.push(selector)
			nestingMap.set(content, selectorList)
			groupedByNestingMap.set(key, tuple)
		})

		const cssLines: string[] = []

		// Process the no-nesting rules first
		const [, noNestingMap] = groupedByNestingMap.get('[]') || [[], undefined]
		if (noNestingMap != null) {
			if (isPreviewMode) {
				const mergedMap = new Map<string, string[]>()
				noNestingMap.forEach((selectorList, content) => {
					const key = selectorList.join(',')
					const list = mergedMap.get(key) || []
					list.push(content)
					mergedMap.set(key, list)
				})
				mergedMap.forEach((value, key) => {
					cssLines.push(`${key}{${value.join(';')}}`)
				})
			}
			else {
				noNestingMap.forEach((selectorList, content) => {
					cssLines.push(`${selectorList.join(',')}{${content}}`)
				})
			}
			groupedByNestingMap.delete('[]')
		}

		// Process the rest
		groupedByNestingMap.forEach(([levels, nestingMap]) => {
			const bodyLines: string[] = []
			if (isPreviewMode) {
				const mergedMap = new Map<string, string[]>()
				nestingMap.forEach((selectorList, content) => {
					const key = selectorList.join(',')
					const list = mergedMap.get(key) || []
					list.push(content)
					mergedMap.set(key, list)
				})
				mergedMap.forEach((value, key) => {
					bodyLines.push(`${key}{${value.join(';')}}`)
				})
			}
			else {
				nestingMap.forEach((selectorList, content) => {
					bodyLines.push(`${selectorList.join(',')}{${content}}`)
				})
			}

			if (levels.length === 0)
				cssLines.push(...bodyLines)

			else
				cssLines.push(wrapWithNesting(levels, bodyLines.join('')))
		})

		return cssLines.join('')
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

	get defaultImportant() {
		return this._defaultImportant
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
		aliasForSelectorConfigList: [],
		shortcutConfigList: [],
	}

	const {
		presets = [],
		aliases: {
			selector: aliasForSelectorConfigList = [],
		} = {},
		shortcuts = [],
	} = config

	presets.forEach((preset) => {
		const resolvedPresetConfig = resolveCommonConfig(preset)
		resolvedConfig.aliasForSelectorConfigList.push(...resolvedPresetConfig.aliasForSelectorConfigList)
		resolvedConfig.shortcutConfigList.push(...resolvedPresetConfig.shortcutConfigList)
	})

	resolvedConfig.aliasForSelectorConfigList.push(...aliasForSelectorConfigList)
	resolvedConfig.shortcutConfigList.push(...shortcuts)

	return resolvedConfig
}

function resolveStyoEngineConfig(config: StyoEngineConfig): ResolvedStyoEngineConfig {
	const {
		prefix = '',
		defaultSelector = [`.${ATOMIC_STYLE_NAME_PLACEHOLDER}`],
		defaultImportant = false,
		...commonConfig
	} = config

	const resolvedCommonConfig = resolveCommonConfig(commonConfig)

	return {
		prefix,
		defaultSelector: [defaultSelector].flat(),
		defaultImportant,
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
