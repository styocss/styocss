import { isAbsolute, resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'
import type { Plugin as VitePlugin } from 'vite'
import { normalizePath } from 'vite'
import { resolveModule } from 'local-pkg'
import { join } from 'pathe'
import type { StyoPluginContext } from './shared'
import { COMMON_PLUGIN_NAME_PREFIX } from './constants'

export function createCommonPlugins(ctx: StyoPluginContext): VitePlugin[] {
	const plugins: VitePlugin[] = []

	if (ctx.dts) {
		plugins.push({
			name: `${COMMON_PLUGIN_NAME_PREFIX}:prepare`,
			async configResolved(config) {
				const { root } = config
				ctx.hasVue = !!resolveModule('vue', { paths: [root] })

				if (ctx.dts === false)
					return

				const normalizedDts = normalizePath(ctx.dts)
				const dtsPath = isAbsolute(normalizedDts)
					? normalizedDts
					: resolve(root, normalizedDts)
				ctx.resolvedDtsPath = dtsPath

				const dir = join(dtsPath, '..')
				await mkdir(dir, { recursive: true }).catch(() => {})
				await ctx.generateDts()
			},
		})
	}

	return plugins
}
