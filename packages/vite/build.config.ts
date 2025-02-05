import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
	clean: true,
	entries: ['src/index.ts'],
	declaration: true,
	rollup: {
		dts: {
			tsconfig: './tsconfig.package.json',
			compilerOptions: {
				composite: false,
			},
		},
		emitCJS: true,
	},
	externals: [
		'vite',
	],
})
