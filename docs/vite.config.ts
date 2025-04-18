import PikaCSS from '@pikacss/vite-plugin-pikacss'
import { defineConfig } from 'vite'
import { groupIconVitePlugin as VitepressGroupIcon } from 'vitepress-plugin-group-icons'

export default defineConfig({
	plugins: [
		PikaCSS({
			fnName: '_pika',
			target: ['**/*.vue', '**/*.md'],
			config: '.vitepress/pika.config.ts',
			tsCodegen: '.vitepress/pika.gen.ts',
			devCss: '.vitepress/pika.dev.css',
		}),
		VitepressGroupIcon(),
	],
})
