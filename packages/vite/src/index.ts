import { type Plugin as VitePlugin, transformWithEsbuild } from 'vite'
import { createDevPlugins } from './dev'
import { createBuildPlugins } from './build'
import type { PluginOptions, ResolvedPluginOptions } from './types'

function StyocssPlugin({
	currentPackageName = '@styocss/vite-plugin-styocss',
	config: configOrPath,
	dts = false,
	extensions = ['.vue', '.tsx', '.jsx'],
	styoFnName = 'styo',
	transformedFormat = 'array',
}: PluginOptions = {}): VitePlugin[] {
	const resolvedOptions: ResolvedPluginOptions = {
		currentPackageName,
		configOrPath,
		dts: dts === true ? 'styo.d.ts' : dts,
		extensions,
		styoFnName,
		transformedFormat,
		transformTsToJs: code => transformWithEsbuild(code, 'styocss.ts').then(result => result.code),
	}
	return [
		...createDevPlugins(resolvedOptions),
		...createBuildPlugins(resolvedOptions),
	]
}

export type {
	StyoEngine,
} from '@styocss/core'

export {
	defineStyoEngineConfig,
} from '@styocss/core'

export type {
	PluginOptions,
}

export default StyocssPlugin
