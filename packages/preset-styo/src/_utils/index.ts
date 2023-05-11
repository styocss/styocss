import type { defineShortcutRuleConfig as _defineShortcutRuleConfig, Properties } from '@styocss/core'
import type { Theme } from '../_theme/types'

type ShortcutRuleConfig = Parameters<typeof _defineShortcutRuleConfig>[0]
export type ShortcutRuleConfigOrCreator = ShortcutRuleConfig | ((theme: Theme) => ShortcutRuleConfig)

export function defineShortcutRuleConfig (config: ShortcutRuleConfigOrCreator) {
  return config
}

export function defineShortcutRuleConfigForSinglePropertyMapping (
  key: string,
  property: keyof Properties,
  mapping: Record<string, string>,
) {
  return defineShortcutRuleConfig({
    type: 'dynamic',
    key,
    pattern: new RegExp(`^(${[...Object.keys(mapping)].join('|')})$`),
    predefined: [...Object.keys(mapping)],
    createPartials: ([, match]) => {
      if (match == null)
        return []

      const value = mapping[match]
      if (value == null)
        return []

      return [{ [property]: value }]
    },
  })
}

export function transformFractionToPercentage (value: string) {
  const fractionPattern = /\s*-?([0-9]+)\/([0-9]+)\s*/g
  return value.replace(fractionPattern, (_, numerator, denominator) => ` ${numerator / denominator * 100}% `).trim()
}
