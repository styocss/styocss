---
title: 'FAQ'
description: 'Frequently asked questions and troubleshooting tips for PikaCSS.'
relatedPackages:
  - '@pikacss/core'
  - '@pikacss/unplugin-pikacss'
  - '@pikacss/nuxt-pikacss'
  - '@pikacss/eslint-config'
relatedSources:
  - 'packages/core/src/engine.ts'
  - 'packages/core/src/types/engine.ts'
  - 'packages/core/src/plugins/selectors.ts'
  - 'packages/integration/src/ctx.ts'
  - 'packages/integration/src/ctx.pipeline.ts'
  - 'packages/integration/src/generatedState.ts'
  - 'packages/unplugin/src/index.ts'
  - 'packages/unplugin/src/types.ts'
  - 'packages/nuxt/src/index.ts'
  - 'packages/eslint-config/src/rules/static-usage.ts'
  - 'packages/plugin-typography/src/index.ts'
  - 'packages/plugin-typography/package.json'
category: troubleshooting
order: 10
---

# FAQ

Common questions and solutions for PikaCSS.

## Why are my styles not appearing?

Make sure your application entry point imports the generated CSS module:

```ts
// main.ts
import 'pika.css'
```

`import 'pika.css'` is the default single-entry logical CSS module. The adapter resolves it to the active run's private runtime CSS under `<stateDir>/runs/...`; `stateDir` is project-configurable, while the runtime CSS has no separate output-path option. Each dev server or build invocation owns its own private artifact.

With Nuxt single-entry authoring, the module injects the sole logical CSS-module import automatically. Explicit multi-entry authoring does not guess a global stylesheet. With the generic unplugin integration, import each logical `cssModule` where that entry's stylesheet is needed and make sure the plugin is registered in your build config.

## `ReferenceError: pika is not defined`

This runtime error means a `pika()` call reached the browser untransformed — `pika` only exists at compile time and has no runtime export. The most common cause is that the file is not matched by the scan globs, so the plugin never processed it. The default `scan.include` is `**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,vue}`, and the default `scan.exclude` skips `node_modules`, `dist`, `.git`, `.nuxt`, `.output`, and `coverage`.

Fixes:

1. If you set a custom `scan.include`, make sure it still matches the file — a custom value replaces the default verbatim rather than extending it. The default glob already covers every extension the transform supports (the JS family plus Vue SFCs); other extensions cannot be transformed even if you add them.
2. Check that the file does not live under an excluded path (`node_modules`, `dist`, `.git`, `.nuxt`, `.output`, `coverage`). If you set a custom `scan.exclude`, confirm it does not accidentally match the file.
3. Confirm the PikaCSS plugin is actually registered in your build config.

## `Cannot find name 'pika'`

This TypeScript error means `<stateDir>/pika.gen.ts` is missing or is not part of your TypeScript program. Run `pikacss prepare` before standalone type-aware tooling, then include `.pikacss/pika.gen.ts` (or your configured `stateDir`) in the TypeScript project.

Typegen is always generated as part of PikaCSS state and cannot be relocated or disabled independently. See [Generated state](/getting-started/setup#generated-state).

## Why does `static-usage` report an ESLint error?

The `pikacss/static-usage` rule checks direct calls to roots from the canonical PikaCSS project config. It reports arguments that are outside the compiler's bounded static subset, invalid static-extension syntax, roots outside their scan ownership, and cross-entry root dependencies. A locally declared root is treated as application code rather than the compile-time macro.

For a runtime value, extract the dynamic part into separate `pika()` calls and combine the resulting class names at the call site:

```ts
// ❌ Invalid — conditional argument
pika(isDark ? { color: 'white' } : { color: 'black' })

// ✅ Valid — separate calls, combine at call site
const className = isDark
  ? pika({ color: 'white' })
  : pika({ color: 'black' })
```

## How do I change the layer order?

Define a custom `layers` map in your engine config. Lower numbers render earlier:

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  engine: {
  layers: {
    reset: -1,
    preflights: 1,
    components: 5,
    utilities: 10,
  },
  },
})
```

See [Layers](/customizations/layers) for a full example.

## Can I use PikaCSS without a build plugin?

Yes. `@pikacss/core` works without a bundler plugin. Create an engine, register styles with `await engine.use(...)`, then compose the CSS output from the layer declaration, preflights, and atomic styles:

<<< @/.examples/troubleshooting/without-build-plugin.example.ts#example

The unplugin integration adds HMR and static extraction but is not required. With Nuxt single-entry authoring, the module auto-imports the sole configured logical `cssModule`; explicit multi-entry authoring does not. Generic unplugin integrations expect the application to import each owning entry's logical `cssModule` explicitly (`pika.css` is the single-entry default).

## How do I add a custom pseudo-class or breakpoint?

Use the `selectors` config property to register custom selectors, including pseudo-classes and media-query responsive breakpoints:

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  engine: {
  selectors: {
    definitions: [
      { name: '@dark', value: 'html.dark $' },
      { name: '@sm', value: '@media (min-width: 640px)' },
    ],
  },
  },
})
```

See [Selectors](/customizations/selectors).

## TypeScript cannot find module augmentations from a plugin

Ensure the plugin package is installed and that your `tsconfig.json` uses a modern module resolution mode such as `moduleResolution: 'bundler'` or `'node16'` so TypeScript can follow the plugin package export map to its declaration file and `@pikacss/core` module augmentation:

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler"
  }
}
```

## Styles are not updating during development (HMR)

The PikaCSS Vite plugin handles HMR automatically. If styles are not updating:

1. Verify the plugin is registered in `vite.config.ts` with `PikaCSS()`.
2. Check that the owning entry's configured logical `cssModule` is imported where its styles are needed (`import 'pika.css'` for the single-entry default).
3. Changing `pika.config.ts` should trigger a config reload automatically. If it does not, confirm you are editing the resolved config file path and that the saved file content actually changed.

## How do I combine PikaCSS classes conditionally?

By default, transformed `pika()` calls produce a plain class name string, so standard JavaScript composition works:

```ts
const base = pika({ display: 'flex', padding: '1rem' })
const active = pika({ color: 'blue' })
const inactive = pika({ color: 'gray' })

const className = `${base} ${isActive ? active : inactive}`
```

If the owning project entry uses `transformedFormat: 'array'`, the configured base `pika()` call returns an array instead. There is no per-call `.arr()` override; compose that array with your framework's usual class handling.

## Does PikaCSS work with SSR / SSG?

Yes. Styles are extracted at build time into static runtime CSS artifacts and every `pika()` call is replaced with plain class-name data — there is no runtime style injection. Each project entry owns its logical `cssModule`, so explicit multi-entry projects can produce multiple independently imported stylesheets. Server-side rendering, static generation, and streaming need no PikaCSS-specific handling beyond serving those ordinary CSS imports. The Nuxt module registers the Vite adapter and, for single-entry authoring only, imports the sole logical CSS module through a generated Nuxt plugin.

## Should I commit the generated files?

The whole `.pikacss/` generated-state directory is reproducible and normally ignored. CI that runs type-aware tooling before a build should run `pikacss prepare` first so `.pikacss/pika.gen.ts` exists. See [Generated state](/getting-started/setup#generated-state).

## Next

- [Getting Started](/getting-started/what-is-pikacss) — start from the beginning.
- [API Reference](/api/) — full API details.
