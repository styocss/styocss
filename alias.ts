import { fileURLToPath } from 'node:url'

export const alias = {
	'@styocss/core': fileURLToPath(new URL('./packages/core/src/', import.meta.url)),
	'@styocss/helpers': fileURLToPath(new URL('./packages/helpers/src/', import.meta.url)),
	'@styocss/vite-plugin-styocss': fileURLToPath(new URL('./packages/vite-plugin-styocss/src/', import.meta.url)),
}
