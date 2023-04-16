// Helpers for runtime
import type {
  RegisteredAtomicStyoRuleObject,
  StyoInstance,
} from '@styocss/core'

export function renderAtomicStyoRule ({
  registeredAtomicStyoRuleObject: {
    name,
    content: {
      nestedWith,
      selector,
      property,
      value,
      important,
    },
  },
  options: {
    defaultSelector,
  },
}: {
  registeredAtomicStyoRuleObject: RegisteredAtomicStyoRuleObject
  options: {
    defaultSelector: string
  }
}) {
  if (
    nestedWith == null
    || selector == null
    || (!selector.includes('{a}') && !selector.includes('&'))
    || important == null
    || property == null
    || value == null
  )
    return null

  const body = `${selector.replace(/\&/g, defaultSelector).replace(/\{a\}/g, name)}{${property}:${value}${important ? ' !important' : ''}}`

  if (nestedWith === '')
    return body

  return `${nestedWith}{${body}}`
}

export function renderAtomicStyoRules ({
  registeredAtomicStyoRuleObjects,
  options,
}: {
  registeredAtomicStyoRuleObjects: RegisteredAtomicStyoRuleObject[]
  options: {
    defaultSelector: string
  }
}): string {
  const cssLines: string[] = ['/* AtomicStyoRule */']

  registeredAtomicStyoRuleObjects.forEach((registeredAtomicStyoRuleObject) => {
    const css = renderAtomicStyoRule({
      registeredAtomicStyoRuleObject,
      options,
    })
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

  styleEl.innerHTML = renderAtomicStyoRules({
    registeredAtomicStyoRuleObjects: [...styo.registeredAtomicStyoRuleMap.values()],
    options: {
      defaultSelector: styo.defaultSelector,
    },
  })

  if (strategy === 'innerHTML') {
    styo.onAtomicStyoRuleRegistered((registeredAtomicStyoRuleObject) => {
      const css = renderAtomicStyoRule({
        registeredAtomicStyoRuleObject,
        options: {
          defaultSelector: styo.defaultSelector,
        },
      })
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
      const css = renderAtomicStyoRule({
        registeredAtomicStyoRuleObject,
        options: {
          defaultSelector: styo.defaultSelector,
        },
      })
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
