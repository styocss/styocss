import { defineEngineConfig } from '@pikacss/core'

export const selectorsConfig = defineEngineConfig({
	selectors: {
		definitions: [
			{ name: '@dark', value: 'html.dark $' },
			{ name: '@light', value: 'html:not(.dark) $' },
			{ name: '@sm', value: '@media (min-width: 640px)' },
			{ name: '@md', value: '@media (min-width: 768px)' },
			{ name: '@lg', value: '@media (min-width: 1024px)' },
		],
	},
})
