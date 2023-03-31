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
  //   noExternal: [
  //     '@styocss/shared',
  //     '@styocss/utilities-engine',
  //   ],
  //   globalName: 'StyoCSS',
  //   format: ['iife'],
  //   outExtension () {
  //     return {
  //       js: '.global.js',
  //     }
  //   },
  //   minify: true,
  //   dts: false,
  //   clean: false,
  // },
])
