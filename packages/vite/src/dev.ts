import { mkdir, writeFile } from 'node:fs/promises'
import * as prettier from 'prettier'
import type { ViteDevServer, Plugin as VitePlugin } from 'vite'
import { join } from 'pathe'
import { getPackageInfo } from 'local-pkg'
import type { StyoPluginContext } from './shared'
import { createFunctionCallTransformer, generateDts, resolveId } from './shared'
import { DEV_PLUGIN_NAME_PREFIX, TEMP_STYLE_FILENAME } from './constants'

function createUpdateFn(fn: () => Promise<any> | any) {
	let timeoutId: any = null
	let currentPromise = Promise.resolve()
	function update() {
		if (timeoutId != null)
			clearTimeout(timeoutId)

		timeoutId = setTimeout(() => {
			timeoutId = null
			currentPromise = currentPromise
				.then(() => fn())
				.catch(error => console.error(error))
		}, 0)
	}

	return update
}

export function createDevPlugins(ctx: StyoPluginContext): VitePlugin[] {
	let tempDir = ''
	let tempStyleFilePath = ''
	const servers: ViteDevServer[] = []

	const updateTempStyleFile = createUpdateFn(async () => {
		await ctx.isReady
		const css = await prettier.format(ctx.engine.renderStyles(), { parser: 'css' })
		await mkdir(tempDir, { recursive: true }).catch(() => {})
		await writeFile(tempStyleFilePath, css)
	})

	const updateDtsFile = createUpdateFn(async () => {
		await ctx.isReady
		await generateDts(ctx)
	})

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
				config.server.watch.ignored.push(`!**/node_modules/${ctx.currentPackageName}/.temp/${TEMP_STYLE_FILENAME}`)
			},
			async configResolved(config) {
				const currentPkgInfo = (await getPackageInfo(ctx.currentPackageName, { paths: [config.root] }))!
				tempDir = join(currentPkgInfo.rootPath, '.temp')
				tempStyleFilePath = join(tempDir, TEMP_STYLE_FILENAME)

				updateTempStyleFile()
				updateDtsFile()
			},
			configureServer(server) {
				servers.push(server)
			},
			buildStart() {
				ctx.engine.hooks.atomicStyleAdded.on(() => updateTempStyleFile())
				ctx.hooks.updateDts.on(() => updateDtsFile())
			},
			resolveId(id) {
				if (resolveId(id))
					return tempStyleFilePath

				return undefined
			},
			transform: createFunctionCallTransformer(ctx),
		},
	]
}
