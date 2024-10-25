import { addPluginTemplate, addVitePlugin, defineNuxtModule } from '@nuxt/kit'
import type { NuxtModule } from '@nuxt/schema'
import ViteStyoCssPlugin from '@styocss/vite-plugin-styocss'
import { join } from 'pathe'

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
		const dtsPath = join(nuxt.options.buildDir, 'types/styo.d.ts') as `${string}.d.ts`
		addVitePlugin(ViteStyoCssPlugin({
			dts: dtsPath,
		}) as any)
		nuxt.hook('prepare:types', (options) => {
			options.tsConfig.include = options.tsConfig.include || []
			options.tsConfig.include.push(dtsPath)
		})
	},
})

export default module
