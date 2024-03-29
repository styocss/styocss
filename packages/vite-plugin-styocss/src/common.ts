import { isAbsolute, resolve } from 'node:path'
import type { Plugin as VitePlugin } from 'vite'
import { normalizePath } from 'vite'
import { resolveModule } from 'local-pkg'
import type { StyoPluginContext } from './shared'
import { COMMON_PLUGIN_NAME_PREFIX } from './constants'

export function createCommonPlugins(ctx: StyoPluginContext): VitePlugin[] {
	const plugins: VitePlugin[] = []

	if (ctx.dts) {
		plugins.push({
			name: `${COMMON_PLUGIN_NAME_PREFIX}:prepare`,
			async configResolved(config) {
				if (ctx.dts === false)
					return

				const { root } = config

				const normalizedDts = normalizePath(ctx.dts)
				const dtsPath = isAbsolute(normalizedDts)
					? normalizedDts
					: resolve(root, normalizedDts)
				ctx.resolvedDtsPath = dtsPath
				ctx.hasVue = !!resolveModule('vue', { paths: [root] })

				await ctx.generateDts()
			},
		})
	}

	return plugins
}
