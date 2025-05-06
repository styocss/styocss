/// <reference path="./pika.gen.ts" />
import { icons } from '@pikacss/plugin-icons'
import { defineEngineConfig } from '@pikacss/vite-plugin-pikacss'

export default defineEngineConfig({
	plugins: [
		icons(),
	],
	icons: {
		autoInstall: true,
	},
})
