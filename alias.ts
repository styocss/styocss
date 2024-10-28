import { fileURLToPath } from 'node:url'

export const alias = {
	'@styocss/core': fileURLToPath(new URL('./packages/core/src/', import.meta.url)),
	'@styocss/vite-plugin-styocss': fileURLToPath(new URL('./packages/vite/src/', import.meta.url)),
	'@styocss/nuxt-styocss': fileURLToPath(new URL('./packages/nuxt/src/', import.meta.url)),
}
