import { defineConfig } from 'tsup'

export default defineConfig([
	// Build js files
	{
		splitting: false,
		entry: {
			index: './src/index.ts',
		},
		format: ['esm', 'cjs'],
		clean: false,
	},
	// Build dts files
	{
		entry: {
			index: './temp-dts/src/index.d.ts',
		},
		dts: {
			only: true,
		},
		clean: false,
		format: ['esm', 'cjs'],
	},
])
