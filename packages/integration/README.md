# @pikacss/integration

Integration layer between the PikaCSS core engine and bundler plugins. Handles config loading, file scanning, source transformation, and code generation.

Most applications should use `@pikacss/unplugin-pikacss` or `@pikacss/nuxt-pikacss`. Use this package directly when implementing a custom integration.

## Installation

```bash
pnpm add @pikacss/integration
```

## Usage

```ts
import { createCtx } from '@pikacss/integration'

const ctx = createCtx({
  cwd: process.cwd(),
  currentPackageName: '@acme/pikacss-integration',
  scan: {
    include: ['**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,vue}'],
    exclude: [
      'node_modules/**',
      'dist/**',
      '.git/**',
      '.nuxt/**',
      '.output/**',
      'coverage/**',
    ],
  },
  configOrPath: undefined,
  fnName: 'pika',
  transformedFormat: 'string',
  tsCodegen: 'pika.gen.ts',
  autoCreateConfig: false,
})
```

Set `currentPackageName` to the package users import your integration from. PikaCSS embeds this value in generated declarations and config scaffolds, so it must not point to `@pikacss/unplugin-pikacss` unless that is the integration actually being used.

`createCtx` is the low-level integration API and requires fully resolved options. Bundler adapters normally apply these scan defaults before calling it. Explicit `scan.include` and `scan.exclude` values in the higher-level bundler plugins replace the bundler plugin defaults; they are not merged with them.

## Documentation

See the [full documentation](https://pikacss.github.io/api/integration).

## License

MIT
