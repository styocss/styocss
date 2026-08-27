---
title: Setup
description: Install PikaCSS, configure a supported build adapter, and prepare generated authoring state.
relatedPackages:
  - '@pikacss/unplugin-pikacss'
relatedSources:
  - 'packages/unplugin/src/types.ts'
  - 'packages/unplugin/src/cli.ts'
  - 'packages/integration/src/operations.ts'
  - 'packages/config/src/types.ts'
category: getting-started
order: 20
---

# Setup

Install one public integration package, add its adapter to your build tool, and reference the generated PikaCSS authoring state from TypeScript.

## Install

::: code-group

```sh [pnpm]
pnpm add -D @pikacss/unplugin-pikacss
```

```sh [npm]
npm install -D @pikacss/unplugin-pikacss
```

```sh [yarn]
yarn add -D @pikacss/unplugin-pikacss
```

:::

You do **not** need to install `@pikacss/core`, `@pikacss/config`, or `@pikacss/integration` separately for normal bundler usage. The outer package re-exports the authoring types/helpers it is designed to expose.

PikaCSS requires Node.js `>=22`. The Vite adapter supports Vite 7 and 8.

## Apply the Vite plugin

<<< @/.examples/getting-started/setup.vite.example.ts

The public adapter options are deliberately narrow: `config?: string` selects an explicit config file and `cwd?: string` overrides the project root when the host does not supply one. PikaCSS semantics belong in `pika.config.*`, not in bundler options.

For the complete supported-host matrix, see [Bundler integrations](/integrations/unplugin).

::: info `pika` is a compile-time global — never import it
The build integration replaces configured Pika calls at build time. Generated TypeScript under `.pikacss/` declares the callable global and its project-derived authoring surface.
:::

## Import the logical CSS module

<<< @/.examples/getting-started/setup.main.example.ts

`pika.css` is the default logical CSS module. The adapter resolves it to the active generation's private runtime CSS file. If you configure another `cssModule`, import that logical module instead.

## Create project config

No config file is required: absence of a config is equivalent to the default single-entry project. To create a canonical config explicitly, run:

```sh
pikacss init
```

`init` is conservative: it creates a suitable `pika.config.*` only when needed and prints the generated-state/type-project wiring you should add. It does not silently rewrite unrelated project files.

A basic project config is:

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  engine: {
    // EngineConfig lives here.
  },
})
```

Automatic discovery checks exactly these project-root candidates:

- `pika.config.ts`
- `pika.config.mts`
- `pika.config.js`
- `pika.config.mjs`

Zero candidates is valid. More than one is an error. An explicit adapter/CLI `config` path uses closed explicit selection instead of auto-discovery.

Filesystem-relative values authored in a selected config, such as `scan`, `stateDir`, and report output paths, resolve from that config file's directory.

## Generated state

PikaCSS owns one generated-state root. By default it is:

```text
.pikacss/
├── pika.gen.ts
├── previews/
└── runs/
```

`pika.gen.ts` is always part of generated state. There is no per-Typegen enable/disable or output-path option. If the project needs another location, configure the whole `stateDir` in `defineConfig()`.

For generic TypeScript projects, include the generated declaration in the TypeScript program. For example:

```json
{
  "include": ["src", ".pikacss/pika.gen.ts"]
}
```

or add a user-owned declaration file under an already-included source directory:

```ts
/// <reference path="../.pikacss/pika.gen.ts" />
```

Before standalone editor/typecheck/ESLint workflows need generated authoring state, run:

```sh
pikacss prepare
```

For an explicit config path:

```sh
pikacss prepare --config ./config/pika.config.ts
```

`prepare` derives the same canonical project configuration as the bundler and publishes Typegen/preview state without scanning application usages or generating production reports.

Framework integrations may own this wiring themselves. In particular, the Nuxt module composes PikaCSS generation with Nuxt's type-preparation lifecycle.

## Commit or ignore generated state?

Generated state is reproducible and normally ignored:

```txt
# .gitignore
.pikacss/
```

CI jobs that run type-aware tooling before a build should run `pikacss prepare` first. Keep `pika.config.*` itself in version control.

## Next

- [Usage](/getting-started/usage) — write styles with `pika()`.
- [Engine Config](/getting-started/engine-config) — understand project versus Engine configuration.
- [ESLint Config](/getting-started/eslint-config) — validate the same static Pika grammar before build.
