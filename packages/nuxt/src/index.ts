import { addPluginTemplate, addVitePlugin, defineNuxtModule } from '@nuxt/kit'
import type { NuxtModule } from '@nuxt/schema'
import ViteStyoCssPlugin from '@styocss/vite-plugin-styocss'
import { join } from 'pathe'

export interface ModuleOptions {}

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
		addVitePlugin(ViteStyoCssPlugin({
			dts: dtsPath,
			currentPackageName: '@styocss/nuxt-styocss',
		}) as any)
		nuxt.hook('prepare:types', (options) => {
			options.tsConfig.include = options.tsConfig.include || []
			options.tsConfig.include.push(dtsPath)
		})
	},
}) as NuxtModule<ModuleOptions>)

export type {
	StyoEngine,
} from '@styocss/vite-plugin-styocss'

export {
	defineStyoEngineConfig,
} from '@styocss/vite-plugin-styocss'
