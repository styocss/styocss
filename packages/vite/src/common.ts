import { mkdir } from 'node:fs/promises'
import type { Plugin as VitePlugin } from 'vite'
import { getPackageInfo, isPackageExists } from 'local-pkg'
import { join } from 'pathe'
import type { StyoPluginContext } from './shared'
import { COMMON_PLUGIN_NAME_PREFIX } from './constants'

export function createCommonPlugins(ctx: StyoPluginContext): VitePlugin[] {
	return [
		{
			name: `${COMMON_PLUGIN_NAME_PREFIX}:prepare`,
			async configResolved(config) {
				const { root } = config
				ctx.hasVue = isPackageExists('vue', { paths: [root] })

				const { rootPath: pkgRootPath } = (await getPackageInfo(ctx.currentPackageName, { paths: [config.root] }))!
				const dtsDir = join(pkgRootPath, 'dts')
				await mkdir(dtsDir, { recursive: true }).catch(() => {})
				ctx.resolvedDtsPath = join(dtsDir, `styo-${ctx.id}.d.ts`)
				await ctx.generateDts()
			},
		},
	]
}
