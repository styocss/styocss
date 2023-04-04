import { fileURLToPath } from 'url'
export const alias = {
  '@styocss/shared': fileURLToPath(new URL('./packages/shared/src/', import.meta.url)),
  '@styocss/utilities-engine': fileURLToPath(new URL('./packages/utilities-engine/src/', import.meta.url)),
  '@styocss/core': fileURLToPath(new URL('./packages/core/src/', import.meta.url)),
}
