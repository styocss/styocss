import type { IntegrationContext } from '@pikacss/integration'
import type { Plugin as VitePlugin } from 'vite'
import type { ResolvedPluginOptions } from './types'
import { createCtx } from '@pikacss/integration'
import { debounce } from 'perfect-debounce'
import { DEV_PLUGIN_NAME, VIRTUAL_PIKA_CSS_ID } from './constants'

export function dev(options: ResolvedPluginOptions): VitePlugin {
	let ctx: IntegrationContext = null!

	const updateDevCssFile = debounce(async () => {
		await ctx.writeDevCssFile()
	}, 300)

	const updateTsCodegenFile = debounce(async () => {
		await ctx.writeTsCodegenFile()
	}, 300)

	const reloadCtx = debounce(async () => {
		await ctx.init()
	}, 300)

	return {
		name: DEV_PLUGIN_NAME,
		enforce: 'pre',
		apply: 'serve',
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
			ctx.hooks.tsCodegenUpdated.on(() => updateTsCodegenFile())
			updateDevCssFile()
			updateTsCodegenFile()
		},
		resolveId(id) {
			if (id === VIRTUAL_PIKA_CSS_ID)
				return ctx.devCssFilepath

			return undefined
		},
		transform: (code, id) => {
			return ctx.transform(code, id)
		},
	}
}
