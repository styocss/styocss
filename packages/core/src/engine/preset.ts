import type { BasicEngineConfig } from '../config'
import type { EnginePlugin } from './plugin'

export interface EnginePreset<Plugins> extends BasicEngineConfig {
	presets?: EnginePreset[]
	plugins?: EnginePlugin[]
}

export function defineEnginePreset<>(preset: EnginePreset) {
	return preset
}
