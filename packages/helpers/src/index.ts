import type { Properties } from '@styocss/core'

/**
 * A function to parse css string to properties object.
 *
 * @example
 * $properties`
 * color: red;
 * font-size: 12px;
 * ` // { color: 'red', 'font-size': '12px' }
 */
function $properties (...args: Parameters<typeof String.raw>) {
  const cssString = `${String.raw(...args).trim().replace(/\/\*[\s\S]*?\*\//g, '')};`
  const result: Record<string, string> = {}
  let state: 'propName' | 'propValue' = 'propName'
  let propName = ''
  let propValue = ''
  let quoteChar = ''
  for (let i = 0; i < cssString.length; i++) {
    const char = cssString.charAt(i)
    switch (state) {
      case 'propName':
        if (char === ':') {
          propName = propName.trim()
          state = 'propValue'
        } else if (/[a-zA-Z0-9-]/.test(char)) {
          propName += char
        }
        break
      case 'propValue':
        if (!quoteChar && (char === '"' || char === '\'')) {
          quoteChar = char
          propValue += char
        } else if (quoteChar === char) {
          quoteChar = ''
          propValue += char
        } else if (!quoteChar && char === ';') {
          propValue = propValue.trim()
          result[propName] = propValue
          propName = ''
          propValue = ''
          state = 'propName'
        } else {
          propValue += char
        }
        break
    }
  }
  if (propName) {
    propValue = propValue.trim()
    result[propName] = propValue
  }
  return result as Properties
}

export {
  $properties,
}
export * from './runtime'
