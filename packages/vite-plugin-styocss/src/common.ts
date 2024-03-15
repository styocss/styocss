import { isAbsolute, resolve } from 'node:path'
import { writeFile } from 'node:fs/promises'
import type { Plugin as VitePlugin } from 'vite'
import { normalizePath } from 'vite'
import { resolveModule } from 'local-pkg'
import type { StyoPluginContext } from './shared'
import { generateDtsContent } from './shared'
import { PLUGIN_NAME_COMMON_DTS_GENERATOR } from './constants'

export function createCommonPlugins(ctx: StyoPluginContext): VitePlugin[] {
	const plugins: VitePlugin[] = []

	if (ctx.dts) {
		plugins.push({
			name: PLUGIN_NAME_COMMON_DTS_GENERATOR,
			async configResolved(config) {
				if (ctx.dts === false)
					return

				const { root } = config

				const normalizedDts = normalizePath(ctx.dts)
				const dtsPath = isAbsolute(normalizedDts)
					? normalizedDts
					: resolve(root, normalizedDts)
				const hasVue = !!resolveModule('vue', { paths: [root] })
				const dtsContent = generateDtsContent({ ctx, hasVue })
				await writeFile(dtsPath, dtsContent)
			},
		})
	}

	return plugins
}
