import { defineConfig } from 'tsdown'

export default defineConfig({
	publint: true,
	entry: ['src/index.ts', 'src/host.ts'],
	format: ['esm'],
	dts: {
		tsconfig: './tsconfig.package.json',
	},
	clean: true,
})
