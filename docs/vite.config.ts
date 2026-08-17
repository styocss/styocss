import pikacss from '@pikacss/unplugin-pikacss/vite'
import { defineConfig } from 'vite'
import { groupIconVitePlugin as vitepressGroupIcon } from 'vitepress-plugin-group-icons'
import llms from 'vitepress-plugin-llms'

export default defineConfig({
	plugins: [
		pikacss({
			fnName: '_pika',
			config: '.vitepress/pika.config.ts',
			tsCodegen: '.vitepress/pika.gen.ts',
		}),
		vitepressGroupIcon(),
		// Keep llms-full.txt English-only; the zh-tw locale is a translation mirror.
		llms({ ignoreFiles: ['zh-tw/**'] }),
	],
	optimizeDeps: {
		// vitepress-plugin-mermaid only lists mermaid's transitive deps
		// (dayjs, debug, ...) in optimizeDeps.include, but under pnpm's strict
		// isolation those are not resolvable from the docs workspace and get
		// skipped. Pre-bundling mermaid itself lets esbuild resolve them from
		// mermaid's own directory; without this, mermaid's raw CJS dayjs
		// import crashes the whole dev page.
		include: ['mermaid'],
	},
})
