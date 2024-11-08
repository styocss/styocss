import { createHash } from 'node:crypto'
import type { Plugin as VitePlugin } from 'vite'
import { resolve } from 'pathe'
import type { StyoPluginContext } from './shared'
import { createFunctionCallTransformer, resolveId } from './shared'
import { BUILD_PLUGIN_NAME_PREFIX, CSS_CONTENT_PLACEHOLDER } from './constants'

function getHash(input: string, length = 8) {
	return createHash('sha256')
		.update(input)
		.digest('hex')
		.slice(0, length)
}

export function createBuildPlugins(ctx: StyoPluginContext): VitePlugin[] {
	// REF: https://github.com/unocss/unocss/blob/916bd6d41690177bbdada958a2ae85a3a160a857/packages/vite/src/modes/global/build.ts#L34
	// use maps to differentiate multiple build. using outDir as key
	const cssPlugins = new Map<string | undefined, VitePlugin | undefined>()

	// eslint-disable-next-line max-params
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

	let root = ''

	return [
		{
			name: `${BUILD_PLUGIN_NAME_PREFIX}:pre`,
			enforce: 'pre',
			apply: 'build',
			configResolved(config) {
				root = config.root
				const distDirs = [
					resolve(config.root, config.build.outDir),
				]

				const cssPlugin = config.plugins.find(i => i.name === 'vite:css') as VitePlugin | undefined
				if (cssPlugin)
					distDirs.forEach(dir => cssPlugins.set(dir, cssPlugin))
			},
			resolveId(id) {
				return resolveId(id)
			},
			load(id) {
				if (resolveId(id))
					return CSS_CONTENT_PLACEHOLDER

				return null
			},
			transform: createFunctionCallTransformer(ctx),
		},
		{
			name: `${BUILD_PLUGIN_NAME_PREFIX}:post`,
			enforce: 'post',
			apply: 'build',
			async generateBundle({ dir }, bundle) {
				Object.values(bundle).forEach(async (chunk) => {
					if (chunk.type === 'asset' && typeof chunk.source === 'string' && chunk.source.includes(CSS_CONTENT_PLACEHOLDER)) {
						const css = await applyCssTransform(
							ctx!.engine.renderStyles().replace(/\n/g, ''),
							`${root}/${chunk.fileName}-styocss-hash.css`,
							dir,
							this,
						)
						chunk.source = chunk.source.replace(CSS_CONTENT_PLACEHOLDER, css)
						const hash = getHash(chunk.source)
						chunk.fileName = chunk.fileName.replace(/\.css$/, `.styo-${hash}.css`)
					}
				})
			},
		},
	]
}
