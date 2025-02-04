import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		include: ['packages/*/tests/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			include: ['packages/*/src/**/*.ts'],
		},
	},
})
