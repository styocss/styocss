import { defineEngineConfig } from '@pikacss/core'

export const variablesConfig = defineEngineConfig({
	variables: {
		definitions: {
			'--color-primary': { value: '#3b82f6' },
			'--color-secondary': { value: '#64748b' },
			'--spacing-md': { value: '1rem' },
		},
	},
})
