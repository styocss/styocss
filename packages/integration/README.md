# @pikacss/integration

Canonical host/runtime integration layer for PikaCSS. It owns project-generation orchestration, source transformation, generated-state publication, prepare/init operations, and production reporting on top of `@pikacss/config` and `@pikacss/core`.

Most applications should install a public outer integration such as `@pikacss/unplugin-pikacss` or `@pikacss/nuxt-pikacss`. Use this package directly when implementing host tooling or invoking the shared programmatic lifecycle.

## Installation

```bash
pnpm add @pikacss/integration
```

## Programmatic prepare

`preparePikaCSS()` derives the same canonical file-backed project configuration used by bundler/framework adapters and materializes generated state without scanning application usages.

```ts
import { preparePikaCSS } from '@pikacss/integration'

const result = await preparePikaCSS({
  cwd: process.cwd(),
  host: {
    publicEntryModule: '@acme/pikacss-integration',
  },
})

console.log(result.declarationPath)
```

An explicit custom config is selected with `config`; semantic settings remain exclusively in that `pika.config.*` module.

## Host adapter context

Advanced host adapters use `createPikaCSSContext()` and provide host mechanics only. Project semantics such as `fnName`, scans, output format, reports, and generated-state location come from canonical `defineConfig()` configuration, not adapter options.

```ts
import { createPikaCSSContext } from '@pikacss/integration'

const ctx = createPikaCSSContext({
  projectRoot: process.cwd(),
  publicEntryModule: '@acme/pikacss-integration',
  mode: () => 'oneshot',
  armDependencies: () => {},
})

await ctx.setup()
await ctx.prepareBuild()
```

The legacy `createCtx()`/`IntegrationContextOptions` surface is not exported from the package root. In particular, hosts cannot provide inline `EngineConfig`, `tsCodegen`, `autoCreateConfig`, `fnName`, or scan semantics through a parallel option channel.

## Documentation

See the [full documentation](https://pikacss.github.io/api/integration).

## License

MIT
