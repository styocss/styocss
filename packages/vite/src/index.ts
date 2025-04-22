import type { PluginOptions, ResolvedPluginOptions } from './types'
import { transformWithEsbuild, type Plugin as VitePlugin } from 'vite'
import { build } from './build'
import { dev } from './dev'

export default function PikaCSSPlugin({
	currentPackageName = '@pikacss/vite-plugin-pikacss',
	config: configOrPath,
	tsCodegen = false,
	devCss = 'pika.dev.css',
	target = ['**/*.vue', '**/*.tsx', '**/*.jsx'],
	fnName = 'pika',
	transformedFormat = 'string',
}: PluginOptions = {}): VitePlugin[] {
	const resolvedOptions: ResolvedPluginOptions = {
		currentPackageName,
		configOrPath,
		tsCodegen: tsCodegen === true ? 'pika.gen.ts' : tsCodegen,
		devCss,
		target,
		fnName,
		transformedFormat,
		transformTsToJs: code => transformWithEsbuild(code, 'pikacss.ts').then(result => result.code),
	}
	return [
		dev(resolvedOptions),
		build(resolvedOptions),
	]
}

export * from '@pikacss/integration'

export type {
	PluginOptions,
}
