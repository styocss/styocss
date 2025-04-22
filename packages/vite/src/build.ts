import type { IntegrationContext } from '@pikacss/integration'
import type { Plugin as VitePlugin } from 'vite'
import { resolve } from 'pathe'
import { BUILD_PLUGIN_NAME, VIRTUAL_PIKA_CSS_ID } from './constants'

export function build(getCtx: () => Promise<IntegrationContext>): VitePlugin {
	// REF: https://github.com/unocss/unocss/blob/916bd6d41690177bbdada958a2ae85a3a160a857/packages/vite/src/modes/global/build.ts#L34
	// use maps to differentiate multiple build. using outDir as key
	const cssPostPlugins = new Map<string | undefined, VitePlugin | undefined>()
	const cssPlugins = new Map<string | undefined, VitePlugin | undefined>()

	async function applyCssTransform(css: string, id: string, dir: string | undefined, rollupCtx: any /* RollupPluginContext */) {
		// TODO: check if postcss is enabled
		const postcss = true
		if (!cssPlugins.get(dir) || !postcss)
			return css
		// @ts-expect-error without this context absolute assets will throw an error
		const result = await cssPlugins.get(dir).transform.call(rollupCtx, css, id)
		if (!result)
			return css
		if (typeof result === 'string')
			css = result
		else if (result.code)
			css = result.code
		css = css.replace(/[\n\r]/g, '')
		return css
	}

	let ctx: IntegrationContext = null!

	return {
		name: BUILD_PLUGIN_NAME,
		enforce: 'pre',
		apply: 'build',
		async configResolved(config) {
			ctx = await getCtx()

			const distDirs = [
				resolve(config.root, config.build.outDir),
			]

			const cssPostPlugin = config.plugins.find(i => i.name === 'vite:css-post') as VitePlugin | undefined
			if (cssPostPlugin)
				distDirs.forEach(dir => cssPostPlugins.set(dir, cssPostPlugin))

			const cssPlugin = config.plugins.find(i => i.name === 'vite:css') as VitePlugin | undefined
			if (cssPlugin)
				distDirs.forEach(dir => cssPlugins.set(dir, cssPlugin))
		},
		resolveId(id) {
			if (id === VIRTUAL_PIKA_CSS_ID)
				return id

			return null
		},
		load(id) {
			if (id === VIRTUAL_PIKA_CSS_ID)
				return ''

			return null
		},
		transform: (code, id) => {
			return ctx.transform(code, id)
		},
		async renderChunk(_, chunk, options) {
			if (!Object.keys(chunk.modules).some(i => i.includes(VIRTUAL_PIKA_CSS_ID)))
				return null

			const cssPost = cssPostPlugins.get(options.dir)
			if (!cssPost) {
				this.warn('[pikacss] failed to find vite:css-post plugin. It might be an internal bug of PikaCSS')
				return null
			}

			await ctx.writeTsCodegenFile()
			const fakeCssId = `${ctx.cwd}/${chunk.fileName}-pikacss-hash.css`
			const css = await applyCssTransform(
				ctx.engine.renderStyles(),
				fakeCssId,
				options.dir,
				this,
			)
			const transformHandler = 'handler' in cssPost.transform!
				? cssPost.transform.handler
				: cssPost.transform!
			await transformHandler.call({} as any, css, fakeCssId)

			delete chunk.modules[VIRTUAL_PIKA_CSS_ID]
			chunk.modules[fakeCssId] = {
				code: null,
				originalLength: 0,
				removedExports: [],
				renderedExports: [],
				renderedLength: 0,
			}

			return null
		},
	}
}
