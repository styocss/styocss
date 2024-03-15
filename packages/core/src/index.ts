import { StyoEngine } from './StyoEngine'
import type {
	DynamicAliasRuleConfig,
	DynamicShortcutRuleConfig,
	StaticAliasRuleConfig,
	StaticShortcutRuleConfig,
	StyoEngineConfig,
	StyoPreset,
} from './types'

function createStyoEngine(config?: StyoEngineConfig) {
	return new StyoEngine(config)
}

function defineStyoEngineConfig(config: StyoEngineConfig) {
	return config
}

function defineStyoPreset(preset: StyoPreset) {
	return preset
}

function defineAliasRuleConfig(config: (StaticAliasRuleConfig | DynamicAliasRuleConfig)) {
	return config
}

function defineShortcutRuleConfig(config: (StaticShortcutRuleConfig | DynamicShortcutRuleConfig)) {
	return config
}

export * from './types'
export * from './StyoEngine'
export * from './constants'
export {
	createStyoEngine,
	defineStyoEngineConfig,
	defineAliasRuleConfig,
	defineShortcutRuleConfig,
	defineStyoPreset,
}
