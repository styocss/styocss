import type { CorePluginConfig } from './types'
import { defineEnginePlugin } from '../engine'
import { important } from './important'
import { keyframes } from './keyframes'
import { selectors } from './selectors'
import { shortcuts } from './shortcuts'
import { variables } from './variables'

export function core() {
	return defineEnginePlugin<CorePluginConfig>([
		important(),
		variables(),
		keyframes(),
		selectors(),
		shortcuts(),
	])
}

export * from './types'
