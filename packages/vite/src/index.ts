import type { Plugin as VitePlugin } from 'vite'
import { transformWithEsbuild } from 'vite'
import type { PluginOptions } from './shared/types'
import { createDevPlugins } from './dev'
import { createBuildPlugins } from './build'
import { createCtx } from './shared'
import { createCommonPlugins } from './common'

function StyocssPlugin(options: PluginOptions = {}): VitePlugin[] {
	const ctx = createCtx({
		...options,
		_transformTsToJs: async tsCode => (await transformWithEsbuild(tsCode, 'styo.temp.ts')).code,
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

export type {
	PluginOptions,
}

export default StyocssPlugin
