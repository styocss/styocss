import { defineConfig } from 'tsup'
import { tempDtsAlias } from '../../temp-dts-alias'

export default defineConfig([
  // Build js files
  {
    entry: {
      index: './src/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: false,
    clean: false,
  },
  // Build dts files
  {
    entry: {
      index: tempDtsAlias['@styocss/helpers'],
    },
    dts: {
      only: true,
      compilerOptions: {
        paths: {
          '@styocss/core': [tempDtsAlias['@styocss/core']],
        },
      },
    },
    clean: false,
  },
])
