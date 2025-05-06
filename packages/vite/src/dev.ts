import type { IntegrationContext } from '@pikacss/integration'
import type { Plugin as VitePlugin } from 'vite'
import { DEV_PLUGIN_NAME, VIRTUAL_PIKA_CSS_ID } from './constants'

export function dev(getCtx: () => Promise<IntegrationContext>): VitePlugin {
	let ctx: IntegrationContext = null!

	return {
		name: DEV_PLUGIN_NAME,
		enforce: 'pre',
		apply: 'serve',
		async configResolved() {
			ctx = await getCtx()
		},
		configureServer(server) {
			server.watcher.add(ctx.configSources)
			server.watcher.on('add', handleFileChange)
			server.watcher.on('unlink', handleFileChange)
			server.watcher.on('change', handleFileChange)
			async function handleFileChange(file: string) {
				if (ctx.configSources.includes(file)) {
					const moduleIds = Array.from(ctx.usages.keys())
					await ctx.init()
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
			ctx.hooks.styleUpdated.on(() => ctx.writeDevCssFile())
			ctx.hooks.tsCodegenUpdated.on(() => ctx.writeTsCodegenFile())
		},
		resolveId(id) {
			if (id === VIRTUAL_PIKA_CSS_ID)
				return ctx.devCssFilepath

			return void 0
		},
		transform: (code, id) => {
			return ctx.transform(code, id)
		},
	}
}
