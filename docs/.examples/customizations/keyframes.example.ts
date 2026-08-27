import { defineEngineConfig } from '@pikacss/core'

export const keyframesConfig = defineEngineConfig({
	keyframes: {
		definitions: [
			{ name: 'fade-in', frames: { from: { opacity: '0' }, to: { opacity: '1' } } },
		],
	},
})
