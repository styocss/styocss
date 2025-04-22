import type { NuxtModule } from '@nuxt/schema'
import type { PluginOptions as VitePikaCSSPluginOptions } from '@pikacss/vite-plugin-pikacss'
import { addPluginTemplate, addVitePlugin, defineNuxtModule, extendViteConfig } from '@nuxt/kit'
import VitePikaCSSPlugin from '@pikacss/vite-plugin-pikacss'
import { join } from 'pathe'

export type ModuleOptions = Omit<VitePikaCSSPluginOptions, 'dts' | 'currentPackageName'>

export default (defineNuxtModule<ModuleOptions>({
	meta: {
		name: 'pikacss',
		configKey: 'pikacss',
	},
	async setup(_, nuxt) {
		addPluginTemplate({
			filename: 'pikacss.mjs',
			getContents() {
				return 'import { defineNuxtPlugin } from \'#imports\';\nexport default defineNuxtPlugin(() => {});\nimport "virtual:pika.css"; '
			},
		})

		const tsCodegenPath = join(nuxt.options.rootDir, 'pika/codegen.ts')
		const devCssPath = join(nuxt.options.rootDir, 'pika/dev.css') as `${string}.css`
		addVitePlugin(VitePikaCSSPlugin({
			tsCodegen: tsCodegenPath,
			devCss: devCssPath,
			currentPackageName: '@pikacss/nuxt-pikacss',
			...(nuxt.options.pikacss || {}),
		}) as any)

		// Avoid ignoring the dev.css file
		extendViteConfig((config) => {
			config.server ??= {}
			config.server.watch ??= {}
			config.server.watch.ignored ??= []
			config.server.watch.ignored = [config.server.watch.ignored].flat()
			config.server.watch.ignored.push(`!${devCssPath}`)
		})

		nuxt.hook('prepare:types', (options) => {
			options.tsConfig.include ||= []
			options.tsConfig.include.push(tsCodegenPath)
		})
	},
}) as NuxtModule<ModuleOptions>)

export * from '@pikacss/vite-plugin-pikacss'

declare module '@nuxt/schema' {
	interface NuxtConfig {
		pikacss?: ModuleOptions
	}
	interface NuxtOptions {
		pikacss?: ModuleOptions
	}
}
