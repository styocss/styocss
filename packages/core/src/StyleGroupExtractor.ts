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
  resolveAliasForNested: (alias: string) => string[] | undefined
  resolveAliasForSelector: (alias: string) => string[] | undefined
  resolveShortcutToAtomicStyleContentList: (shortcut: string) => AtomicStyleContent[]
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
  AliasTemplateForNested extends string,
  AliasForSelector extends string,
  AliasTemplateForSelector extends string,
  Shortcut extends string,
  ShortcutTemplate extends string,
> {
  private _options: StyleGroupExtractorOptions

  constructor (options: StyleGroupExtractorOptions) {
    this._options = options
  }

  extract (group: StyleGroup<AliasForNested, AliasTemplateForNested, AliasForSelector, AliasTemplateForSelector, Shortcut, ShortcutTemplate>): AtomicStyleContent[] {
    const {
      defaultNested,
      defaultSelector,
      defaultImportant,
      resolveAliasForNested,
      resolveAliasForSelector,
      resolveShortcutToAtomicStyleContentList,
    } = this._options

    const {
      $nested: nested,
      $selector: selector,
      $important: important,
      $apply: apply,
      ...rawProperties
    } = group

    const finalNested = nested == null
      ? [defaultNested]
      : [nested].flat(1).flatMap((maybeAlias) => resolveAliasForNested(maybeAlias) || maybeAlias)

    const finalSelector = (
      selector == null
        ? [defaultSelector]
        : [selector].flat(1).flatMap((maybeAlias) => resolveAliasForSelector(maybeAlias) || maybeAlias)
    )
      .flatMap((theSelector) => theSelector.split(/\s*,\s*/))
      .map((theSelector) => patchSelectorPlaceholder(theSelector).replace(DEFAULT_SELECTOR_PLACEHOLDER_RE_GLOBAL, defaultSelector))

    const finalImportant = important != null ? important : defaultImportant

    const result: AtomicStyleContent[] = []

    if (apply != null) {
      [apply].flat(1).forEach((shortcut) => {
        const resolved = resolveShortcutToAtomicStyleContentList(shortcut)
        resolved.forEach((content) => {
          finalNested.forEach((theNested) => {
            finalSelector.forEach((theSelector) => {
              result.push({
                ...content,
                nested: theNested,
                selector: theSelector,
                important: finalImportant,
              })
            })
          })
        })
      })
    }

    if ((Object.keys(rawProperties).length === 0) && (result.length === 0))
      throw new Error('No properties defined')

    const propertyEntries = Object.entries(Object.fromEntries(Object.entries(rawProperties).map(([property, value]) => [toKebab(property), normalizeValue(value as any)])))

    propertyEntries
      .forEach(([property, value]) => {
        finalNested.forEach((theNested) => {
          finalSelector.forEach((theSelector) => {
            result.push({
              nested: theNested,
              selector: theSelector,
              important: finalImportant,
              property,
              value,
            })
          })
        })
      })

    return result
  }
}

export {
  StyleGroupExtractor,
}
