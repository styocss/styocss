import { StyoEngine } from './StyoEngine'
import type {
	DynamicSelectorAliasRule,
	DynamicShortcutRule,
	StaticSelectorAliasRule,
	StaticShortcutRule,
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

function defineStaticSelectorAliasRule(rule: StaticSelectorAliasRule) {
	return rule
}

function defineDynamicSelectorAliasRule(rule: DynamicSelectorAliasRule) {
	return rule
}

function defineStaticShortcutRule(rule: StaticShortcutRule) {
	return rule
}

function defineDynamicShortcutRule(rule: DynamicShortcutRule) {
	return rule
}

export * from './utils'
export * from './types'
export * from './StyoEngine'
export * from './constants'
export {
	createStyoEngine,
	defineStyoEngineConfig,
	defineStaticSelectorAliasRule,
	defineDynamicSelectorAliasRule,
	defineStaticShortcutRule,
	defineDynamicShortcutRule,
	defineStyoPreset,
}
