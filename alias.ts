import { fileURLToPath } from 'url'
export const alias = {
  '@styocss/shared': fileURLToPath(new URL('./packages/shared/src/', import.meta.url)),
  '@styocss/atomic-macro-item-engine': fileURLToPath(new URL('./packages/atomic-macro-item-engine/src/', import.meta.url)),
  '@styocss/core': fileURLToPath(new URL('./packages/core/src/', import.meta.url)),
  '@styocss/helpers': fileURLToPath(new URL('./packages/helpers/src/', import.meta.url)),
}
