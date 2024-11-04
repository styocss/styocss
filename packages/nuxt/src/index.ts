import { addPluginTemplate, addVitePlugin, defineNuxtModule } from '@nuxt/kit'
import type { NuxtModule } from '@nuxt/schema'
import ViteStyoCssPlugin from '@styocss/vite-plugin-styocss'

export interface ModuleOptions {}

const module: NuxtModule<ModuleOptions> = defineNuxtModule<ModuleOptions>({
	meta: {
		name: 'styocss',
		configKey: 'styocss',
	},
	async setup(_, nuxt) {
		addPluginTemplate({
			filename: 'styocss.mjs',
			getContents() {
				return [
					'import "virtual:styo.css"',
					'import { defineNuxtPlugin } from \'#imports\'; export default defineNuxtPlugin(() => {})',
				].join('\n')
			},
		})
		addVitePlugin(ViteStyoCssPlugin({
			_currentPackageName: '@styocss/nuxt-styocss',
		}) as any)
		nuxt.hook('prepare:types', (options) => {
			options.tsConfig.include = options.tsConfig.include || []
			options.tsConfig.include.push('@styocss/nuxt-styocss/dts')
		})
	},
})

export default module

export type {
	StyoEngine,
} from '@styocss/vite-plugin-styocss'

export {
	defineStyoEngineConfig,
} from '@styocss/vite-plugin-styocss'
