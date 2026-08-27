/// <reference path="../.pikacss/pika.gen.ts" />
import { icons } from '@pikacss/plugin-icons'
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
	fnName: '_pika',
	stateDir: '../.pikacss',
	engine: {
		plugins: [
			icons(),
		],
		shortcuts: {
			definitions: [
				// Static shortcut
				['flex-center', {
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
				}],
				// Dynamic shortcut
				[/^m-(\d+)$/, m => ({ margin: `${m[1]}px` }), ['m-4', 'm-8']], // Autocomplete suggestions
			],
		},
		icons: {
			autoInstall: true,
		},
	},
})
