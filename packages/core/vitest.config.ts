import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		include: ['tests/**/*.test.ts'],
		coverage: {
			enabled: true,
			provider: 'v8',
			include: ['src/**/*.ts'],
		},
	},
})
