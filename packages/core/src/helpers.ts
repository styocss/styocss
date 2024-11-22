import type { EngineConfig, PresetConfig } from './config'
import type { SelectorConfig, ShortcutConfig } from './resolvers'

export function defineEngineConfig(config: EngineConfig) {
	return config
}

export function definePreset(preset: PresetConfig) {
	return preset
}

export function defineSelector(config: SelectorConfig) {
	return config
}

export function defineShortcut(config: ShortcutConfig) {
	return config
}
