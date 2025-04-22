import type { PluginOptions, ResolvedPluginOptions } from './types'
import { createCtx, type IntegrationContext } from '@pikacss/integration'
import { transformWithEsbuild, type Plugin as VitePlugin } from 'vite'
import { build } from './build'
import { SHARED_PLUGIN_NAME } from './constants'
import { dev } from './dev'

function createPromise<T = void>() {
	let resolve: (value: T) => void
	let reject: (reason?: any) => void
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve: resolve!, reject: reject! }
}

export default function PikaCSSPlugin({
	currentPackageName = '@pikacss/vite-plugin-pikacss',
	config: configOrPath,
	tsCodegen = true,
	devCss = 'pika.dev.css',
	target = ['**/*.vue', '**/*.tsx', '**/*.jsx'],
	fnName = 'pika',
	transformedFormat = 'string',
	autoCreateConfig = true,
}: PluginOptions = {}): VitePlugin[] & { getCtx: () => Promise<IntegrationContext> } {
	const resolvedOptions: ResolvedPluginOptions = {
		currentPackageName,
		configOrPath,
		tsCodegen: tsCodegen === true ? 'pika.gen.ts' : tsCodegen,
		devCss,
		target,
		fnName,
		transformedFormat,
		transformTsToJs: code => transformWithEsbuild(code, 'pikacss.ts').then(result => result.code),
		autoCreateConfig,
	}

	const { promise, resolve } = createPromise<IntegrationContext>()
	function getCtx() {
		return promise
	}

	const plugin = [
		{
			name: SHARED_PLUGIN_NAME,
			enforce: 'pre',
			async configResolved(config) {
				resolve(await createCtx({
					cwd: config.root,
					...resolvedOptions,
				}))
			},
		} satisfies VitePlugin,
		dev(getCtx),
		build(getCtx),
	] as any as VitePlugin[] & { getCtx: () => Promise<IntegrationContext> }
	plugin.getCtx = getCtx
	return plugin
}

export * from '@pikacss/integration'

export type {
	PluginOptions,
}
