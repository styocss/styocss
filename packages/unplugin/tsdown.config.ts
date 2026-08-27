import { defineConfig } from 'tsdown'

export default defineConfig({
	publint: true,
	entry: [
		'src/index.ts',
		'src/bin.ts',
		'src/vite.ts',
		'src/rollup.ts',
		'src/webpack.ts',
		'src/rspack.ts',
		'src/rolldown.ts',
	],
	format: ['esm'],
	dts: {
		tsconfig: './tsconfig.package.json',
	},
	clean: true,
})
