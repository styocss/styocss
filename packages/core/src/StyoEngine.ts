import {
  isArray,
  isNotNullish,
  type EventHookListener,
} from '@styocss/shared'
import {
  createEventHook,
  numberToAlphabets,
} from '@styocss/shared'

import type {
  AtomicStyleContent,
  AddedAtomicStyle,
  StyleItem,
  ResolvedStyoEngineConfig,
  ResolvedCommonConfig,
  CommonConfig,
  StyoEngineConfig,
} from './types'

import { AliasResolver } from './AliasResolver'
import { ShortcutResolver } from './ShortcutResolver'
import { StyleGroupExtractor } from './StyleGroupExtractor'
import {
  ATOMIC_STYLE_NAME_PLACEHOLDER,
  ATOMIC_STYLE_NAME_PLACEHOLDER_RE_GLOBAL,
} from './constants'

class StyoEngine<
  AliasForNested extends string = string,
  AliasTemplateForNested extends string = string,
  AliasForSelector extends string = string,
  AliasTemplateForSelector extends string = string,
  Shortcut extends string = string,
  ShortcutTemplate extends string = string,
> {
  private _config: StyoEngineConfig
  private _prefix: string
  private _defaultNested: string
  private _defaultSelector: string
  private _defaultImportant: boolean

  private _aliasForNestedResolver: AliasResolver = new AliasResolver()
  private _aliasForSelectorResolver: AliasResolver = new AliasResolver()
  private _shortcutResolver: ShortcutResolver = new ShortcutResolver()
  private _styleGroupExtractor: StyleGroupExtractor

  private _addedGlobalStyleList: string[] = []
  private _cachedAtomicStyleName = new Map<string, string>()
  private _cachedShortcutToAtomicStyleContentListMap = new Map<string, AtomicStyleContent[]>()
  private _atomicStylesMap = new Map<string, AddedAtomicStyle>()
  private _atomicStyleAddedHook = createEventHook<AddedAtomicStyle>()

  constructor (config?: StyoEngineConfig) {
    this._config = config || {}
    const {
      prefix,
      defaultNested,
      defaultSelector,
      defaultImportant,
      aliasForNestedConfigList,
      aliasForSelectorConfigList,
      shortcutConfigList,
    } = this._resolveStyoEngineConfig(config || {})

    this._prefix = prefix
    this._defaultNested = defaultNested
    this._defaultSelector = defaultSelector
    this._defaultImportant = defaultImportant

    aliasForNestedConfigList.forEach((theConfig) => {
      if (theConfig.type === 'static') {
        const { type: _, ...rule } = theConfig
        this._aliasForNestedResolver.addStaticAliasRule(rule)
      } else if (theConfig.type === 'dynamic') {
        const {
          type: _,
          description = '',
          predefined = [],
          template = [],
          ...rest
        } = theConfig
        const rule = {
          description,
          predefined,
          template,
          ...rest,
        }
        this._aliasForNestedResolver.addDynamicAliasRule(rule)
      }
    })
    aliasForSelectorConfigList.forEach((theConfig) => {
      if (theConfig.type === 'static') {
        const { type: _, ...rule } = theConfig
        this._aliasForSelectorResolver.addStaticAliasRule(rule)
      } else if (theConfig.type === 'dynamic') {
        const {
          type: _,
          description = '',
          predefined = [],
          template = [],
          ...rest
        } = theConfig
        const rule = {
          description,
          predefined,
          template,
          ...rest,
        }
        this._aliasForSelectorResolver.addDynamicAliasRule(rule)
      }
    })
    shortcutConfigList.forEach((theConfig) => {
      if (theConfig.type === 'static') {
        const { type: _, ...rule } = theConfig
        this._shortcutResolver.addStaticShortcutRule(rule)
      } else if (theConfig.type === 'dynamic') {
        const {
          type: _,
          description = '',
          predefined = [],
          template = [],
          ...rest
        } = theConfig
        const rule = {
          description,
          predefined,
          template,
          ...rest,
        }
        this._shortcutResolver.addDynamicShortcutRule(rule)
      }
    })

    this._styleGroupExtractor = new StyleGroupExtractor({
      defaultNested,
      defaultSelector,
      defaultImportant,
      resolveAliasForNested: (alias) => this._aliasForNestedResolver.resolveAlias(alias),
      resolveAliasForSelector: (alias) => this._aliasForSelectorResolver.resolveAlias(alias),
      resolveShortcutToAtomicStyleContentList: (name) => this._resolveStyleItemList([name]),
    })
  }

  private _resolveCommonConfig (config: CommonConfig): ResolvedCommonConfig {
    const resolvedConfig: ResolvedCommonConfig = {
      aliasForNestedConfigList: [],
      aliasForSelectorConfigList: [],
      shortcutConfigList: [],
    }

    const {
      presets = [],
      aliases: {
        nested: aliasForNestedConfigList = [],
        selector: aliasForSelectorConfigList = [],
      } = {},
      shortcuts = [],
    } = config

    presets.forEach((preset) => {
      const resolvedPresetConfig = this._resolveCommonConfig(preset)
      resolvedConfig.aliasForNestedConfigList.push(...resolvedPresetConfig.aliasForNestedConfigList)
      resolvedConfig.aliasForSelectorConfigList.push(...resolvedPresetConfig.aliasForSelectorConfigList)
      resolvedConfig.shortcutConfigList.push(...resolvedPresetConfig.shortcutConfigList)
    })

    resolvedConfig.aliasForNestedConfigList.push(...aliasForNestedConfigList)
    resolvedConfig.aliasForSelectorConfigList.push(...aliasForSelectorConfigList)
    resolvedConfig.shortcutConfigList.push(...shortcuts)

    return resolvedConfig
  }

  private _resolveStyoEngineConfig (config: StyoEngineConfig): ResolvedStyoEngineConfig {
    const {
      prefix = '',
      defaultNested = '',
      defaultSelector = `.${ATOMIC_STYLE_NAME_PLACEHOLDER}`,
      defaultImportant = false,
      ...commonConfig
    } = config

    const resolvedCommonConfig = this._resolveCommonConfig(commonConfig)

    return {
      prefix,
      defaultNested,
      defaultSelector,
      defaultImportant,
      ...resolvedCommonConfig,
    }
  }

  private _notifyAtomicStyleAdded (added: AddedAtomicStyle) {
    this._atomicStyleAddedHook.trigger(added)
  }

  private _getAtomicStyleName (content: AtomicStyleContent) {
    const key = serializeAtomicStyleContent(content)
    const cached = this._cachedAtomicStyleName.get(key)
    if (cached != null)
      return cached

    const num = this._cachedAtomicStyleName.size
    const name = `${this.prefix}${numberToAlphabets(num)}`
    this._cachedAtomicStyleName.set(key, name)
    return name
  }

  private _resolveStyleItemList (itemList: StyleItem[]) {
    const atomicStyleContentList: AtomicStyleContent[] = []
    itemList.forEach((styleItem) => {
      if (typeof styleItem === 'string') {
        const cached = this._cachedShortcutToAtomicStyleContentListMap.get(styleItem)
        if (cached != null) {
          atomicStyleContentList.push(...cached)
          return
        }

        this._shortcutResolver
          .resolveShortcut(styleItem)
          .forEach((group) => {
            atomicStyleContentList.push(...this._styleGroupExtractor.extract(group))
          })
      } else {
        atomicStyleContentList.push(...this._styleGroupExtractor.extract(styleItem))
      }
    })
    return optimizeAtomicStyleContentList(atomicStyleContentList)
  }

  private _renderGlobalStyles (): string {
    return this._addedGlobalStyleList.join('')
  }

  private _renderAtomicStyles (): string {
    // Render atomic rules
    const renderObjects = [...this.atomicStylesMap.values()]
      .map(({
        name,
        content: { nested, selector, important, property, value },
      }) => {
        if (
          !selector.includes(ATOMIC_STYLE_NAME_PLACEHOLDER)
          || value == null
        )
          return null

        const renderObject = {
          nested,
          selector: selector.replace(ATOMIC_STYLE_NAME_PLACEHOLDER_RE_GLOBAL, name),
          content: isArray(value)
            ? value.map((value) => `${property}:${value}${important ? ' !important' : ''}`).join(';')
            : `${property}:${value}${important ? ' !important' : ''}`,
        }

        return renderObject
      })
      .filter(isNotNullish)

    const groupedByNestedMap = new Map</* nested */ string, Map</* content */ string, /* selectorList */ string[]>>()
    renderObjects.forEach(({ content, nested, selector }) => {
      const nestedMap = groupedByNestedMap.get(nested) || new Map()
      const selectorList = nestedMap.get(content) || []
      selectorList.push(selector)
      nestedMap.set(content, selectorList)
      groupedByNestedMap.set(nested, nestedMap)
    })

    const cssLines: string[] = []

    // Process the no-nested rules first
    const noNestedMap = groupedByNestedMap.get('')
    if (noNestedMap != null) {
      noNestedMap.forEach((selectorList, content) => {
        cssLines.push(`${selectorList.join(',')}{${content}}`)
      })
      groupedByNestedMap.delete('')
    }

    // Process the rest
    groupedByNestedMap.forEach((nestedMap, nested) => {
      const bodyLines: string[] = []
      nestedMap.forEach((selectorList, content) => {
        bodyLines.push(`${selectorList.join(',')}{${content}}`)
      })
      if (nested === '')
        cssLines.push(...bodyLines)
      else
        cssLines.push(`${nested}{${bodyLines.join('')}}`)
    })

    return cssLines.join('')
  }

  get config () {
    return this._config
  }

  get prefix () {
    return this._prefix
  }

  get defaultNested () {
    return this._defaultNested
  }

  get defaultSelector () {
    return this._defaultSelector
  }

  get defaultImportant () {
    return this._defaultImportant
  }

  get staticAliasForNestedRuleList () {
    return this._aliasForNestedResolver.staticAliasRuleList
  }

  get dynamicAliasForNestedRuleList () {
    return this._aliasForNestedResolver.dynamicAliasRuleList
  }

  get staticAliasForSelectorRuleList () {
    return this._aliasForSelectorResolver.staticAliasRuleList
  }

  get dynamicAliasForSelectorRuleList () {
    return this._aliasForSelectorResolver.dynamicAliasRuleList
  }

  get staticShortcutRuleList () {
    return this._shortcutResolver.staticShortcutRuleList
  }

  get dynamicShortcutRuleList () {
    return this._shortcutResolver.dynamicShortcutRuleList
  }

  get atomicStylesMap () {
    return new Map(this._atomicStylesMap)
  }

  // TODO: implement warning

  onAtomicStyleAdded (listener: EventHookListener<AddedAtomicStyle>) {
    return this._atomicStyleAddedHook.on(listener)
  }

  globalStyo (cssString: string) {
    const minified = cssString.replace(/\s+/g, ' ').trim()
    if (minified === '')
      return

    this._addedGlobalStyleList.push(minified)
  }

  styo (...itemList: [StyleItem<AliasForNested, AliasTemplateForNested, AliasForSelector, AliasTemplateForSelector, Shortcut, ShortcutTemplate>, ...StyleItem<AliasForNested, AliasTemplateForNested, AliasForSelector, AliasTemplateForSelector, Shortcut, ShortcutTemplate>[]]) {
    const atomicStyleContentList = this._resolveStyleItemList(itemList)
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
        this._notifyAtomicStyleAdded(registered)
      }
    })
    return atomicStyleNameList
  }

  renderStyles () {
    return [
      '/* Global Styles */',
      this._renderGlobalStyles(),
      '/* Atomic Styles */',
      this._renderAtomicStyles(),
    ].join('')
  }
}

function serializeAtomicStyleContentWithoutValue ({ nested, selector, important, property }: AtomicStyleContent) {
  return `[${nested}][${selector}][${important}][${property}]`
}

function serializeAtomicStyleContent ({ nested, selector, important, property, value }: AtomicStyleContent) {
  return `[${nested}][${selector}][${important}][${property}][${value == null ? null : value}]`
}

function optimizeAtomicStyleContentList (list: AtomicStyleContent[]) {
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

    map.delete(key)
    map.set(key, content)
  })
  return [...map.values()]
}

export {
  StyoEngine,
}
