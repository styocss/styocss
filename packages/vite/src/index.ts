import type { Plugin as VitePlugin } from 'vite'
import { isPackageExists } from 'local-pkg'
import { isAbsolute, join, resolve } from 'pathe'
import type { PluginOptions } from './shared/types'
import { createDevPlugins } from './dev'
import { createBuildPlugins } from './build'
import { COMMON_PLUGIN_NAME_PREFIX } from './constants'
import { createCtx } from './shared'

function StyocssPlugin(options: PluginOptions = {}): VitePlugin[] {
	const ctx = createCtx(options)
	return [
		{
			name: `${COMMON_PLUGIN_NAME_PREFIX}:pre`,
			enforce: 'pre',
			configResolved(config) {
				ctx.hasVue = isPackageExists('vue', { paths: [config.root] })

				if (ctx.dts !== false) {
					ctx.resolvedDtsPath = isAbsolute(ctx.dts)
						? resolve(ctx.dts)
						: join(config.root, ctx.dts)
				}

				ctx.ready()
			},
		},
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
