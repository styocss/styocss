import { defineEngineConfig } from '@pikacss/core'

export const shortcutsConfig = defineEngineConfig({
	shortcuts: {
		definitions: [
			{ name: 'flex-center', value: {
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
			} },
		],
	},
})
