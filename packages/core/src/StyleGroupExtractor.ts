import {
  isArray,
  toKebab,
} from '@styocss/shared'
import {
  ATOMIC_STYLE_NAME_PLACEHOLDER,
  DEFAULT_SELECTOR_PLACEHOLDER,
  DEFAULT_SELECTOR_PLACEHOLDER_RE_GLOBAL,
} from './constants'
import type {
  StyleGroup,
  AtomicStyleContent,
} from './types'

interface StyleGroupExtractorOptions {
  defaultNested: string
  defaultSelector: string
  defaultImportant: boolean
  resolveAliasForNested: (alias: string) => string | undefined
  resolveAliasForSelector: (alias: string) => string | undefined
  resolveMacroStyleNameToAtomicStyleContentList: (name: string) => AtomicStyleContent[]
}

function patchSelectorPlaceholder (selector: string) {
  return (selector.includes(ATOMIC_STYLE_NAME_PLACEHOLDER) || selector.includes(DEFAULT_SELECTOR_PLACEHOLDER))
    ? selector
    : `${DEFAULT_SELECTOR_PLACEHOLDER}${selector}`
}

function normalizeValue (value: AtomicStyleContent['value']) {
  if (isArray(value))
    return [...new Set(value)]

  return value
}

class StyleGroupExtractor<
  AliasForNested extends string,
  AliasForSelector extends string,
  MacroStyleName extends string,
> {
  private _options: StyleGroupExtractorOptions

  constructor (options: StyleGroupExtractorOptions) {
    this._options = options
  }

  extract (group: StyleGroup<AliasForNested, AliasForSelector, MacroStyleName>): AtomicStyleContent[] {
    const {
      defaultNested,
      defaultSelector,
      defaultImportant,
      resolveAliasForNested,
      resolveAliasForSelector,
      resolveMacroStyleNameToAtomicStyleContentList,
    } = this._options

    const {
      $nested: nested,
      $selector: selector,
      $important: important,
      $apply: apply,
      ...rawProperties
    } = group

    const resolvedNested = nested != null ? resolveAliasForNested(nested) : undefined
    const finalNested = nested != null
      ? resolvedNested != null
        ? resolvedNested
        : nested
      : defaultNested

    const resolvedSelector = selector != null ? resolveAliasForSelector(selector) : undefined
    const finalSelector = selector != null
      ? patchSelectorPlaceholder(
        resolvedSelector != null
          ? resolvedSelector
          : selector,
      )
        .replace(DEFAULT_SELECTOR_PLACEHOLDER_RE_GLOBAL, defaultSelector)
      : defaultSelector

    const finalImportant = important != null ? important : defaultImportant

    const result: AtomicStyleContent[] = []

    if (apply != null) {
      apply.forEach((macroStyleName) => {
        const resolved = resolveMacroStyleNameToAtomicStyleContentList(macroStyleName)
        resolved.forEach((content) => {
          result.push({
            ...content,
            nested: finalNested,
            selector: finalSelector,
            important: finalImportant,
          })
        })
      })
    }

    if ((Object.keys(rawProperties).length === 0) && (result.length === 0))
      throw new Error('No properties defined')

    const propertyEntries = Object.entries(Object.fromEntries(Object.entries(rawProperties).map(([property, value]) => [toKebab(property), normalizeValue(value as any)])))

    propertyEntries
      .forEach(([property, value]) => {
        result.push({
          nested: finalNested,
          selector: finalSelector,
          important: finalImportant,
          property,
          value,
        })
      })

    return result
  }
}

export {
  StyleGroupExtractor,
}
