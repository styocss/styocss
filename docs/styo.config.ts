import { icons } from '@styocss/plugin-icons'
import { defineEngineConfig } from '@styocss/vite-plugin-styocss'

export default defineEngineConfig({
	plugins: [
		icons(),
	],
	selectors: [
		[':hover', '&&:hover'],
	],
	variables: [
		['--color-primary', '#f13e74'],
	],
	shortcuts: [
		{
			shortcut: 'bg-primary',
			value: {
				backgroundColor: 'var(--color-primary)',
			},
		},
	],
	icons: {
		autoInstall: true,
	},
})
