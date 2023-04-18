import type { StyoInstance } from '@styocss/core'
import { renderAtomicStyoRules } from '@styocss/helpers'

export function renderRules (styo: StyoInstance) {
  return renderAtomicStyoRules({
    registeredAtomicStyoRuleObjects: [...styo.registeredAtomicStyoRuleMap.values()],
  })
}
