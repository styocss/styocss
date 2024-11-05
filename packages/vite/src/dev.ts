import { mkdir, writeFile } from 'node:fs/promises'
import * as prettier from 'prettier'
import type { ViteDevServer, Plugin as VitePlugin } from 'vite'
import { join } from 'pathe'
import { getPackageInfo } from 'local-pkg'
import type { StyoPluginContext } from './shared'
import { createFunctionCallTransformer, generateDts, resolveId } from './shared'
import { DEV_PLUGIN_NAME_PREFIX } from './constants'

export function createDevPlugins(ctx: StyoPluginContext): VitePlugin[] {
	const tempStyleFilename = `styo.css`
	let tempStyleFilePath = ''
	const servers: ViteDevServer[] = []

	let timeoutId: any = null
	let writeFilePromise = Promise.resolve()
	function update() {
		if (timeoutId != null)
			clearTimeout(timeoutId)

		timeoutId = setTimeout(async () => {
			timeoutId = null

			const css = await prettier.format(ctx.engine.renderStyles(), { parser: 'css' })
			writeFilePromise = writeFilePromise.then(
				() => Promise.all([
					writeFile(tempStyleFilePath, css),
					generateDts(ctx),
				])
					.then(() => {})
					.catch(error => console.error(error)),
			)
		}, 0)
	}

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
				config.server.watch.ignored.push(`!**/node_modules/${ctx.currentPackageName}/.temp/${tempStyleFilename}`)
			},
			async configResolved(config) {
				const { rootPath: pkgRootPath } = (await getPackageInfo(ctx.currentPackageName, { paths: [config.root] }))!
				const tempDir = join(pkgRootPath, '.temp')
				await mkdir(tempDir, { recursive: true }).catch(() => {})
				tempStyleFilePath = join(tempDir, tempStyleFilename)
				await writeFile(tempStyleFilePath, '')
			},
			configureServer(server) {
				servers.push(server)
			},
			buildStart() {
				ctx.engine.onAtomicStyleAdded(() => {
					update()
				})
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
