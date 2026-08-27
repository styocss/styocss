import { icons } from '@pikacss/plugin-icons'
import { reset } from '@pikacss/plugin-reset'
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
	scan: {
		exclude: [
			'node_modules/**',
			'dist/**',
			'.git/**',
			'.nuxt/**',
			'.output/**',
			'coverage/**',
			'src/templates/**',
		],
	},
	engine: {
		plugins: [icons(), reset()],
		icons: {
			prefix: 'i-',
			scale: 1.2,
		},
		reset: 'modern-normalize',
	},
})
