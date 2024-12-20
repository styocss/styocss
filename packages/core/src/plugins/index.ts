import { defineEnginePlugin } from '../helpers'
import { type SelectorConfig, selectors } from './selectors'
import { type ImportantConfig, important } from './important'
import { type VariableConfig, variables } from './variables'
import { type ShortcutConfig, shortcuts } from './shortcuts'
import { type KeyframesConfig, keyframes } from './keyframes'

export interface CorePluginsConfig {
	selectors?: SelectorConfig[]
	important?: ImportantConfig
	variables?: VariableConfig[]
	shortcuts?: ShortcutConfig[]
	keyframes?: KeyframesConfig[]
}

export function corePlugins() {
	return defineEnginePlugin([
		variables(),
		...important(),
		...selectors(),
		...shortcuts(),
		keyframes(),
	])
}
