import { defineConfig } from 'tsup'

export default defineConfig([
	// Build js files
	{
		entry: {
			index: './src/index.ts',
		},
		format: ['esm', 'cjs'],
		dts: false,
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
