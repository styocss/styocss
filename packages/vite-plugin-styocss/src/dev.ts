import { tmpdir } from 'node:os'
import { promises as fsPromises } from 'node:fs'
import * as prettier from 'prettier'
import type { ViteDevServer, Plugin as VitePlugin } from 'vite'
import { join } from 'pathe'
import type { StyoPluginContext } from './shared'
import { createFunctionCallTransformer, resolveId } from './shared'
import { DEV_PLUGIN_NAME_PREFIX } from './constants'

export function createDevPlugins(ctx: StyoPluginContext): VitePlugin[] {
	let tempStyleFile = ''
	const servers: ViteDevServer[] = []

	let timeoutId: any = null
	let writeFilePromise = Promise.resolve()
	function update() {
		if (timeoutId != null)
			clearTimeout(timeoutId)

		timeoutId = setTimeout(async () => {
			timeoutId = null

			const css = await prettier.format(ctx.engine.renderStyles(), { parser: 'css' })
			writeFilePromise = writeFilePromise.then(() => fsPromises.writeFile(tempStyleFile, css))
		}, 0)
	}

	return [
		{
			name: `${DEV_PLUGIN_NAME_PREFIX}:pre`,
			enforce: 'pre',
			apply: 'serve',
			async configResolved() {
				tempStyleFile = join(await fsPromises.mkdtemp(join(tmpdir(), 'styocss-')), 'styo.css')
				await fsPromises.writeFile(tempStyleFile, '')
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
					return tempStyleFile

				return undefined
			},
			transform: createFunctionCallTransformer(ctx),
		},
	]
}
