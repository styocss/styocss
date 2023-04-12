// Helpers for runtime
import type {
  RegisteredAtomicStyoRuleObject,
  StyoInstance,
} from '@styocss/core'

export function renderAtomicStyoRule ({
  name,
  content: {
    nestedWith,
    selector,
    property,
    value,
    important,
  },
}: RegisteredAtomicStyoRuleObject) {
  if (
    nestedWith == null
    || selector == null
    || !selector.includes('{a}')
    || important == null
    || property == null
    || value == null
  )
    return null

  const body = `${selector.replaceAll('{a}', name)}{${property}:${value}${important ? ' !important' : ''}}`

  if (nestedWith === '')
    return body

  return `${nestedWith}{${body}}`
}

export function renderAtomicStyoRules (atomicStyoRules: RegisteredAtomicStyoRuleObject[]): string {
  const cssLines: string[] = ['/* AtomicStyoRule */']

  atomicStyoRules.forEach((atomicStyoRule) => {
    const css = renderAtomicStyoRule(atomicStyoRule)
    if (css != null)
      cssLines.push(css)
  })

  return cssLines.join('\n')
}

export function bindStyleEl (
  styo: StyoInstance,
  styleEl: HTMLStyleElement,
  {
    strategy = 'sheet',
  }: {
    strategy?: 'innerHTML' | 'sheet'
  } = {},
) {
  if (strategy !== 'innerHTML' && strategy !== 'sheet')
    throw new Error(`Unknown strategy: ${strategy}`)

  styleEl.innerHTML = renderAtomicStyoRules([...styo.registeredAtomicStyoRuleMap.values()])

  if (strategy === 'innerHTML') {
    styo.onAtomicStyoRuleRegistered((registeredAtomicStyoRuleObject) => {
      const css = renderAtomicStyoRule(registeredAtomicStyoRuleObject)
      if (css != null) {
        try {
          styleEl.innerHTML += `\n${css}`
        } catch (error) {
          console.error(error)
        }
      }
    })
  } else if (strategy === 'sheet') {
    const sheet = styleEl.sheet
    if (sheet == null)
      throw new Error('Cannot find the sheet of the style element')

    styo.onAtomicStyoRuleRegistered((registeredAtomicStyoRuleObject) => {
      const css = renderAtomicStyoRule(registeredAtomicStyoRuleObject)
      if (css != null) {
        try {
          sheet.insertRule(css, sheet.cssRules.length)
        } catch (error) {
          console.error(error)
        }
      }
    })
  }
}
