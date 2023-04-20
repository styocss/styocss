import {
  ATOMIC_STYO_RULE_NAME_PLACEHOLDER,
  ATOMIC_STYO_RULE_NAME_PLACEHOLDER_RE_GLOBAL,
} from '@styocss/core'
import { isArray } from '@styocss/shared'
import type { StyoPluginContext } from './types'

export function renderStyles (ctx: StyoPluginContext): string {
  // Render atomic rules
  /**
   * 1. Only render active atomic rules
   * 2. Same nestedWith would be grouped together
   * 3. Same content would be grouped together, and the selector list would be joined by comma
   * 4. The no-nested atomic rules would always be rendered first to make sure the nested rules are able to override the no-nested rules
   */
  // Step 1: Get all active atomic rules
  const activeAtomicRulesSet = new Set([...ctx.activeAtomicStyoRulesMap.values()].flatMap((theSet) => [...theSet]))

  // Step 2: Retrieve render objects
  const renderObjects = [...ctx.styo.registeredAtomicStyoRuleMap.values()]
    .map(({
      name,
      content: { nestedWith, selector, important, property, value },
    }) => {
      if (
        !activeAtomicRulesSet.has(name)
        || nestedWith == null
        || selector == null
        || !selector.includes(ATOMIC_STYO_RULE_NAME_PLACEHOLDER)
        || important == null
        || property == null
        || value == null
      )
        return null

      const renderObject = {
        nestedWith,
        selector: selector.replace(ATOMIC_STYO_RULE_NAME_PLACEHOLDER_RE_GLOBAL, name),
        content: isArray(value)
          ? value.map((value) => `${property}:${value}${important ? ' !important' : ''}`).join(';')
          : `${property}:${value}${important ? ' !important' : ''}`,
      }

      return renderObject
    })
    .filter((i): i is NonNullable<typeof i> => i != null)

  // Step 3: Group render objects by nestedWith and content
  const groupedByNestedWithMap = new Map</* nestedWith */ string, Map</* content */ string, /* selectorList */ string[]>>()
  renderObjects.forEach(({ content, nestedWith, selector }) => {
    const nestedWithMap = groupedByNestedWithMap.get(nestedWith) || new Map()
    const selectorList = nestedWithMap.get(content) || []
    selectorList.push(selector)
    nestedWithMap.set(content, selectorList)
    groupedByNestedWithMap.set(nestedWith, nestedWithMap)
  })

  // Step 4: Render grouped render objects
  const cssLines: string[] = ['/* AtomicStyoRules */']

  // Process the no-nested rules first
  const noNestedWithMap = groupedByNestedWithMap.get('')
  if (noNestedWithMap != null) {
    noNestedWithMap.forEach((selectorList, content) => {
      cssLines.push(`${selectorList.join(',')}{${content}}`)
    })
    groupedByNestedWithMap.delete('')
  }

  // Process the rest
  groupedByNestedWithMap.forEach((nestedWithMap, nestedWith) => {
    const bodyLines: string[] = []
    nestedWithMap.forEach((selectorList, content) => {
      bodyLines.push(`${selectorList.join(',')}{${content}}`)
    })
    if (nestedWith === '')
      cssLines.push(...bodyLines)
    else
      cssLines.push(`${nestedWith}{${bodyLines.join('')}}`)
  })

  return cssLines.join('')
}
