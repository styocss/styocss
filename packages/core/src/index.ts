import { StyoPresetBuilder } from './StyoPresetBuilder'
import { StyoInstanceBuilder } from './StyoInstanceBuilder'

export * from './StyoPresetBuilder'
export * from './StyoInstanceBuilder'
export * from './StyoInstance'
export * from './types'

export function createStyoPreset (name: string) {
  return new StyoPresetBuilder(name)
}

export function createStyoInstance () {
  return new StyoInstanceBuilder()
}
