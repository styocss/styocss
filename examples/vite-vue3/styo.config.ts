import { defineEngineConfig } from '@styocss/vite-plugin-styocss'

export default defineEngineConfig({
	selectors: [
		['@dark', 'html.dark &&'],
	],
})
