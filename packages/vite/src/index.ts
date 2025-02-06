import { type Plugin as VitePlugin, transformWithEsbuild } from 'vite'
import { dev } from './dev'
import { build } from './build'
import type { PluginOptions, ResolvedPluginOptions } from './types'

export default function StyoCSSPlugin({
	currentPackageName = '@styocss/vite-plugin-styocss',
	config: configOrPath,
	dts = false,
	target = ['**/*.vue', '**/*.tsx', '**/*.jsx'],
	fnName = 'styo',
	previewEnabled = true,
	transformedFormat = 'string',
}: PluginOptions = {}): VitePlugin[] {
	const resolvedOptions: ResolvedPluginOptions = {
		currentPackageName,
		configOrPath,
		dts: dts === true ? 'styo.d.ts' : dts,
		target,
		fnName,
		previewEnabled,
		transformedFormat,
		transformTsToJs: code => transformWithEsbuild(code, 'styocss.ts').then(result => result.code),
	}
	return [
		dev(resolvedOptions),
		build(resolvedOptions),
	]
}

export * from '@styocss/integration'

export type {
	PluginOptions,
}
