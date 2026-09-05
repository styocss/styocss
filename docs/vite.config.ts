import pikacss from '@pikacss/unplugin-pikacss/vite'
import { defineConfig } from 'vite'
import { groupIconVitePlugin as vitepressGroupIcon } from 'vitepress-plugin-group-icons'
import llms from 'vitepress-plugin-llms'

export default defineConfig({
	plugins: [
		pikacss({
			config: '.vitepress/pika.config.ts',
		}),
		vitepressGroupIcon(),
		// Keep llms-full.txt English-only; the zh-tw locale is a translation mirror.
		llms({ ignoreFiles: ['zh-tw/**'] }),
	],
})
