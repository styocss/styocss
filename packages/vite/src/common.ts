import { type Plugin as VitePlugin, normalizePath } from 'vite'
import { isPackageExists } from 'local-pkg'
import { isAbsolute, resolve } from 'pathe'
import { type StyoPluginContext, generateDts } from './shared'
import { COMMON_PLUGIN_NAME_PREFIX } from './constants'

export function createCommonPlugins(ctx: StyoPluginContext): VitePlugin[] {
	return [
		{
			name: `${COMMON_PLUGIN_NAME_PREFIX}:prepare`,
			async configResolved(config) {
				const { root } = config
				ctx.hasVue = isPackageExists('vue', { paths: [root] })

				if (ctx.dts === false)
					return

				const normalizedDts = normalizePath(ctx.dts)
				ctx.resolvedDtsPath = isAbsolute(normalizedDts)
					? normalizedDts
					: resolve(root, normalizedDts)
				await generateDts(ctx)
			},
		},
	]
}
