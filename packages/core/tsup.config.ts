import { defineConfig } from 'tsup'

export default defineConfig([
  // Build js files
  {
    entry: {
      index: './src/index.ts',
    },
    format: ['esm', 'cjs'],
    outExtension ({ format }) {
      if (format === 'esm')
        return { js: '.mjs' }

      if (format === 'cjs')
        return { js: '.cjs' }

      return {
        js: '.js',
      }
    },
    dts: false,
    clean: false,
  },
  // Build dts files
  {
    entry: {
      index: './temp-dts/core/src/index.d.ts',
    },
    dts: {
      only: true,
      compilerOptions: {
        paths: {
          '@styocss/shared': ['./temp-dts/shared/src/index.d.ts'],
        },
      },
    },
    clean: false,
  },
])
