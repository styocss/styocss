import { StyoEngine } from './StyoEngine'
import type {
  PresetConfig,
  StyoEngineConfig,
} from './types'

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
export {
  createStyoEngine,
  defineStyoEngineConfig,
  defineStyoPreset,
}
