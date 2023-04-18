import { defineConfig } from 'tsup'
import { alias } from '../../alias'
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
    esbuildOptions (options) {
      options.alias = alias
    },
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
