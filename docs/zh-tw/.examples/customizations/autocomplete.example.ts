import { defineEngineConfig } from '@pikacss/core'

export const autocompleteConfig = defineEngineConfig({
	selectors: {
		definitions: [
			{
				pattern: /^state-(.+)$/,
				inputType: '`state-${string}`',
				resolve: match => `&[data-state=\"${match[1]}\"]`,
				autocomplete: ['state-open', 'state-closed'],
			},
		],
	},
	variables: {
		definitions: {
			'--brand-color': {
				value: '#3b82f6',
				suggest: { asValueOf: 'color' },
			},
		},
	},
})
