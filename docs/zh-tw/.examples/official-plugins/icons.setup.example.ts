import { icons } from '@pikacss/plugin-icons/node'
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
	engine: {
		plugins: [icons()],
		icons: {
			prefix: 'i-',
			mode: 'auto',
		},
	},
})
