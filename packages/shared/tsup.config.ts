import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: {
      index: './src/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: false,
    clean: false,
  },
  // {
  //   entry: {
  //     index: './src/index.ts',
  //   },
  //   format: ['iife'],
  //   minify: true,
  //   dts: false,
  //   clean: false,
  // },
])
