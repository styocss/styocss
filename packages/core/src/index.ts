import { StyoEngine } from './StyoEngine'
import type {
  PresetConfig,
  Properties,
  StyoEngineConfig,
} from './types'

const css = String.raw

function style (...args: Parameters<typeof String.raw>) {
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

type CssFn = typeof css
type StyleFn = typeof style

function createStyoEngine<
  AliasForNested extends string,
  AliasForSelector extends string,
  MacroStyleName extends string,
> (config?: StyoEngineConfig<AliasForNested, AliasForSelector, MacroStyleName>) {
  return new StyoEngine<AliasForNested, AliasForSelector, MacroStyleName>(config)
}

function defineStyoEngineConfig<
  AliasForNested extends string,
  AliasForSelector extends string,
  MacroStyleName extends string,
> (config: StyoEngineConfig<AliasForNested, AliasForSelector, MacroStyleName>) {
  return config
}

function defineStyoPreset<
  AliasForNested extends string,
  AliasForSelector extends string,
  MacroStyleName extends string,
> (config: PresetConfig<AliasForNested, AliasForSelector, MacroStyleName>) {
  return config
}

export * from './types'
export * from './StyoEngine'
export * from './constants'
export type {
  CssFn,
  StyleFn,
}
export {
  css,
  style,
  createStyoEngine,
  defineStyoEngineConfig,
  defineStyoPreset,
}
