import type { NuxtModule } from '@nuxt/schema'
import type { PluginOptions as ViteStyoCssPluginOptions } from '@styocss/vite-plugin-styocss'
import { addPluginTemplate, addVitePlugin, defineNuxtModule, extendViteConfig } from '@nuxt/kit'
import ViteStyoCssPlugin from '@styocss/vite-plugin-styocss'
import { join } from 'pathe'

export type ModuleOptions = Omit<ViteStyoCssPluginOptions, 'dts' | 'currentPackageName'>

export default (defineNuxtModule<ModuleOptions>({
	meta: {
		name: 'styocss',
		configKey: 'styocss',
	},
	async setup(_, nuxt) {
		addPluginTemplate({
			filename: 'styocss.mjs',
			getContents() {
				return 'import { defineNuxtPlugin } from \'#imports\';\nexport default defineNuxtPlugin(() => {});\nimport "virtual:styo.css"; '
			},
		})

		const dtsPath = join(nuxt.options.buildDir, 'types/styo.d.ts') as `${string}.d.ts`
		const devCssPath = join(nuxt.options.rootDir, 'styo/dev.css') as `${string}.css`
		addVitePlugin(ViteStyoCssPlugin({
			dts: dtsPath,
			devCss: devCssPath,
			currentPackageName: '@styocss/nuxt-styocss',
			...(nuxt.options.styocss || {}),
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
			options.tsConfig.include.push(dtsPath)
		})
	},
}) as NuxtModule<ModuleOptions>)

export * from '@styocss/vite-plugin-styocss'

declare module '@nuxt/schema' {
	interface NuxtConfig {
		styocss?: ModuleOptions
	}
	interface NuxtOptions {
		styocss?: ModuleOptions
	}
}
