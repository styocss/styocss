import { defineConfig } from 'tsdown'

export default defineConfig({
	publint: true,
	entry: ['src/index.ts', 'src/bin.ts'],
	format: ['esm'],
	dts: {
		tsconfig: './tsconfig.package.json',
	},
	clean: true,
	deps: {
		neverBundle: ['@nuxt/schema'],
	},
})
