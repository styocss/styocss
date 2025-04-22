import type { NuxtModule } from '@nuxt/schema'
import type { PluginOptions as VitePikaCSSPluginOptions } from '@pikacss/vite-plugin-pikacss'
import { addPluginTemplate, addVitePlugin, defineNuxtModule } from '@nuxt/kit'
import VitePikaCSSPlugin from '@pikacss/vite-plugin-pikacss'

export type ModuleOptions = Omit<VitePikaCSSPluginOptions, 'currentPackageName'>

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

		const vitePlugin = VitePikaCSSPlugin({
			currentPackageName: '@pikacss/nuxt-pikacss',
			...(nuxt.options.pikacss || {}),
		})
		addVitePlugin(vitePlugin)

		nuxt.hook('prepare:types', async (options) => {
			const ctx = await vitePlugin.getCtx()
			const tsCodegenFilepath = ctx.tsCodegenFilepath
			if (tsCodegenFilepath == null)
				return
			options.tsConfig.include ||= []
			options.tsConfig.include.push(tsCodegenFilepath)
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
