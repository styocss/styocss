import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		include: ['.examples/**/*.example.test.ts', 'zh-tw/.examples/**/*.example.test.ts'],
		coverage: {
			enabled: false,
		},
	},
	resolve: {
		alias: {
			'@pikacss/core': new URL('../packages/core/src/index.ts', import.meta.url).pathname,
			'@pikacss/integration/testing': new URL('../packages/integration/src/testing.ts', import.meta.url).pathname,
		},
	},
})
