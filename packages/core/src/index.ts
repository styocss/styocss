import { StyoEngine } from './StyoEngine'
import type {
	DynamicNestingAliasRuleConfig,
	DynamicSelectorAliasRuleConfig,
	DynamicShortcutRuleConfig,
	StaticNestingAliasRuleConfig,
	StaticSelectorAliasRuleConfig,
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

function defineNestingAliasRuleConfig(config: (StaticNestingAliasRuleConfig | DynamicNestingAliasRuleConfig)) {
	return config
}

function defineSelectorAliasRuleConfig(config: (StaticSelectorAliasRuleConfig | DynamicSelectorAliasRuleConfig)) {
	return config
}

function defineShortcutRuleConfig(config: (StaticShortcutRuleConfig | DynamicShortcutRuleConfig)) {
	return config
}

export * from './utils'
export * from './types'
export * from './StyoEngine'
export * from './constants'
export {
	createStyoEngine,
	defineStyoEngineConfig,
	defineNestingAliasRuleConfig,
	defineSelectorAliasRuleConfig,
	defineShortcutRuleConfig,
	defineStyoPreset,
}
