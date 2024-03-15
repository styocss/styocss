import type { Plugin as VitePlugin } from 'vite'
import { transformWithEsbuild } from 'vite'
import type { StyoPluginOptions } from './shared/types'
import { createDevPlugins } from './dev'
import { createBuildPlugins } from './build'
import { createCtx } from './shared'
import { createCommonPlugins } from './common'

function createStyoPlugin(options: Omit<StyoPluginOptions, 'transformTsToJs'> = {}): VitePlugin[] {
	const ctx = createCtx({
		...options,
		transformTsToJs: async tsCode => (await transformWithEsbuild(tsCode, 'temp.ts')).code,
	})

	return [
		...createCommonPlugins(ctx),
		...createDevPlugins(ctx),
		...createBuildPlugins(ctx),
	]
}

export type {
	StyoEngine,
} from '@styocss/core'

export {
	defineStyoEngineConfig,
} from '@styocss/core'

export default createStyoPlugin
