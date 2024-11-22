import type { Plugin as VitePlugin } from 'vite'
import { debounce } from 'perfect-debounce'
import type { IntegrationContext } from '@styocss/integration'
import { DEV_CSS_FILENAME, createCtx } from '@styocss/integration'
import { DEV_PLUGIN_NAME_PREFIX, VIRTUAL_STYO_CSS_ID } from './constants'
import type { ResolvedPluginOptions } from './types'

export function createDevPlugins(options: ResolvedPluginOptions): VitePlugin[] {
	let ctx: IntegrationContext = null!

	const updateDevCssFile = debounce(async () => {
		await ctx.writeDevCssFile()
	}, 300)

	const updateDtsFile = debounce(async () => {
		await ctx.writeDtsFile()
	}, 300)

	const reloadCtx = debounce(async () => {
		await ctx.init()
	}, 300)

	return [
		{
			name: `${DEV_PLUGIN_NAME_PREFIX}:pre`,
			enforce: 'pre',
			apply: 'serve',
			async config(config) {
				config.server ??= {}
				config.server.watch ??= {}
				config.server.watch.ignored ??= []
				config.server.watch.ignored = [config.server.watch.ignored].flat()
				config.server.watch.ignored.push(`!**/node_modules/${options.currentPackageName}/.temp/${DEV_CSS_FILENAME}`)
			},
			async configResolved(config) {
				ctx = await createCtx({
					cwd: config.root,
					...options,
				})
			},
			configureServer(server) {
				server.watcher.add(ctx.configSources)
				server.watcher.on('add', handleFileChange)
				server.watcher.on('unlink', handleFileChange)
				server.watcher.on('change', handleFileChange)
				async function handleFileChange(file: string) {
					if (ctx.configSources.includes(file)) {
						const moduleIds = Array.from(ctx.usages.keys())
						await reloadCtx()
						moduleIds.forEach((id) => {
							const mod = server.moduleGraph.getModuleById(id)
							if (mod) {
								server.moduleGraph.invalidateModule(mod)
								server.reloadModule(mod)
							}
						})
					}
				}
			},
			buildStart() {
				ctx.hooks.styleUpdated.on(() => updateDevCssFile())
				ctx.hooks.dtsUpdated.on(() => updateDtsFile())
			},
			resolveId(id) {
				if (id === VIRTUAL_STYO_CSS_ID)
					return ctx.devCssFilepath

				return undefined
			},
			transform: (code, id) => {
				return ctx.transform(code, id)
			},
		},
	]
}
