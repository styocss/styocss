import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const ROOT_DIR = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig({
	test: {
		root: ROOT_DIR,
		environment: 'node',
		include: ['scripts/ci/*.test.ts', 'scripts/maintain-docs/*.test.ts', 'scripts/maintain-i18n/*.test.ts'],
	},
})
