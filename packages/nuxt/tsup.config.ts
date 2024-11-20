import { defineConfig } from 'tsup'

export default defineConfig({
	entry: {
		index: './src/index.ts',
	},
	clean: true,
	dts: true,
	format: ['esm', 'cjs'],
})
