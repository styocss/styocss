---
title: Setup
description: Install PikaCSS and configure your build tool to start using atomic CSS-in-JS.
relatedPackages:
  - '@pikacss/core'
  - '@pikacss/unplugin-pikacss'
relatedSources:
  - 'packages/unplugin/package.json'
  - 'packages/unplugin/src/vite.ts'
  - 'packages/unplugin/src/index.ts'
  - 'packages/unplugin/src/types.ts'
  - 'packages/integration/src/ctx.ts'
  - 'packages/integration/src/tsCodegen.ts'
  - 'packages/core/src/plugins/selectors.ts'
  - 'packages/core/src/plugins/shortcuts.ts'
  - 'packages/core/src/plugins/variables.ts'
category: getting-started
order: 20
---

# Setup

Install PikaCSS and add the build plugin to start generating atomic CSS from your style definitions.

## Install

::: code-group

```sh [pnpm]
pnpm add -D @pikacss/core @pikacss/unplugin-pikacss
```

```sh [npm]
npm install -D @pikacss/core @pikacss/unplugin-pikacss
```

```sh [yarn]
yarn add -D @pikacss/core @pikacss/unplugin-pikacss
```

:::

PikaCSS requires Node.js 22 or later (package engine range: `>=22`).

The Vite entry supports Vite 7 and 8 only (peer dependency `vite: ^7.0.0 || ^8.0.0`).

## Apply Vite Plugin

Add the PikaCSS Vite plugin to your `vite.config.ts`:

<<< @/.examples/getting-started/setup.vite.example.ts

For other build tools, see [Integrations](/integrations/unplugin).

::: info `pika` is a compile-time global — never import it
You do not import `pika` anywhere, and `@pikacss/core` has no runtime `pika` export. The build plugin replaces every `pika()` call with the generated class names at build time, and TypeScript learns the global from the generated `pika.gen.ts` declaration file (see [Generated Files](#generated-files)).
:::

## Import `pika.css`

Import the generated CSS file in your application entry point:

<<< @/.examples/getting-started/setup.main.example.ts

This import resolves to the generated runtime CSS that contains all your atomic styles. The physical file is internal PikaCSS state kept under `.pikacss/` in your project root — you never reference it directly, and its location is not configurable.

## Generated Files

On each dev or build run, the plugin generates codegen output in the project root (the plugin working directory — your Vite root unless the `cwd` option is set):

| File | Purpose |
|---|---|
| `pika.gen.ts` | TypeScript declarations for the `pika` global |
| `.pikacss/` | Internal live working state, including the runtime CSS behind `import 'pika.css'` |
| `pika.config.js` | Engine config — **not** created automatically; only scaffolded when you opt in with `autoCreateConfig: true` |

Setting `tsCodegen` to a string writes the declaration output to a custom path; setting it to `false` disables TypeScript declaration codegen entirely. The runtime CSS location is internal and not configurable.

### pika.config.js

`autoCreateConfig` defaults to `false`, so the plugin never writes a config into your repository on its own — create one yourself. Running with no config still works (the engine uses its defaults) and logs a hint. To have the first run scaffold one for you, opt in with `autoCreateConfig: true`. Either way the file looks like:

```js
/// <reference path="./pika.gen.ts" />
import { defineEngineConfig } from '@pikacss/unplugin-pikacss'

export default defineEngineConfig({
  // Add your PikaCSS engine config here
})
```

The triple-slash reference pulls the generated `pika.gen.ts` declarations into the TypeScript program whenever the config file itself is type-checked — it only helps when your tsconfig covers the config file, so do not rely on it in place of the recipes in [pika.gen.ts](#pika-gen-ts) below.

Use either a `pika.config.ts` or `pika.config.js` — but never keep two. Config discovery is limited to the **project root** and checks a fixed candidate list in priority order (`pika.config.{ts,mts,cts,js,mjs,cjs}`, then the `pikacss.config.*` equivalents). When more than one exists, the highest-priority file is loaded and the rest are logged as ignored.

### pika.gen.ts

When `tsCodegen` is enabled (the default), the build plugin generates a TypeScript declaration file — `pika.gen.ts` in the project root, or a custom path when `tsCodegen` is a string. It declares the `pika` global and provides autocomplete for all custom selectors, shortcuts, variables, and plugin-contributed properties.

TypeScript only sees these declarations when the generated file is part of your TypeScript program. A stock Vite template with `"include": ["src"]` does not cover a root-level `pika.gen.ts`, which results in `Cannot find name 'pika'` everywhere. Pick one of these recipes:

**Option A — generate the file inside `src/`:**

```ts
// vite.config.ts
PikaCSS({
  tsCodegen: './src/pika.gen.ts',
})
```

**Option B — add the file to your tsconfig `include`:**

```json
// tsconfig.json (or tsconfig.app.json)
{
  "include": ["src", "pika.gen.ts"]
}
```

### .pikacss/ (runtime CSS)

Each dev server or build run owns a private runtime CSS file under `.pikacss/` containing:

- Layer order declarations
- Preflight styles (resets, variables, keyframes)
- Atomic utility classes

`import 'pika.css'` resolves to the current run's file automatically and it is rewritten whenever your source code or configuration changes. Because every run owns its own file, several dev servers, builds, or coding agents can safely share one project without corrupting each other's styles. Stale entries left behind by crashed runs are harmless.

### Commit or Ignore?

Generated outputs are fully regenerated on every dev or build run, so treating them as ignorable build artifacts works:

```txt
# .gitignore
pika.gen.ts
.pikacss/
```

One caveat: a standalone typecheck (for example `tsc --noEmit` in CI) fails with `Cannot find name 'pika'` when `pika.gen.ts` has never been generated in that environment. Either run a dev/build step before typechecking, or commit `pika.gen.ts`. The scaffolded `pika.config.js` is your own config file — commit it.

## Next

- [Usage](/getting-started/usage) — learn how to write styles with `pika()`.
- [Engine Config](/getting-started/engine-config) — configure layers, preflights, and plugins.
- [ESLint Config](/getting-started/eslint-config) — enable static analysis for style definitions.
