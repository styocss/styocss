import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
	entries: ['src/index.ts'],
	declaration: true,
	rollup: {
		emitCJS: true,
	},
	externals: [
		'@nuxt/schema',
	],
})
