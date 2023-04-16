import { defineConfig } from 'tsup'
import { tempDtsAlias } from '../../temp-dts-alias'

export default defineConfig([
  // Build js files
  {
    splitting: false,
    entry: {
      index: './src/index.ts',
    },
    format: ['esm', 'cjs'],
    clean: false,
  },
  // Build dts files
  {
    entry: {
      index: tempDtsAlias['@styocss/vite-plugin-styocss'],
    },
    dts: {
      only: true,
    },
    clean: false,
  },
])
