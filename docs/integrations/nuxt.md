---
title: Nuxt
description: Zero-config PikaCSS integration for Nuxt applications.
relatedPackages:
  - '@pikacss/nuxt-pikacss'
relatedSources:
  - 'packages/nuxt/src/index.ts'
category: integrations
order: 20
---

# Nuxt

The PikaCSS Nuxt module provides zero-config integration for Nuxt applications.

::: code-group

```sh [pnpm]
pnpm add -D @pikacss/nuxt-pikacss
```

```sh [npm]
npm install -D @pikacss/nuxt-pikacss
```

```sh [yarn]
yarn add -D @pikacss/nuxt-pikacss
```

:::

Add the module to `nuxt.config.ts`:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@pikacss/nuxt-pikacss'],
  pikacss: {
    // options
  },
})
```

:::warning
When you use `@pikacss/nuxt-pikacss`, do not also register `@pikacss/unplugin-pikacss/vite` manually in `vite.config.ts`. The Nuxt module already owns the Vite adapter and, for single-entry authoring, the sole CSS-module auto-import.
:::

## What the Module Does

### Vite Plugin Registration

The module automatically registers `@pikacss/unplugin-pikacss/vite` with `enforce: 'pre'`, ensuring style extraction runs before other transformations.

### CSS Auto-Import

For **single-entry authoring**, the module reads the canonical project shape and generates a Nuxt plugin template that imports that entry's configured `cssModule`. The default single-entry module is `pika.css`.

For **explicit multi-entry authoring**, the module does not guess a global stylesheet. No CSS module is auto-imported, even when the explicit array currently contains only one entry; import the intended CSS modules explicitly from application code.

## CLI and preparation

A direct install of `@pikacss/nuxt-pikacss` also provides its own `pikacss` binary:

```bash
pikacss init [--cwd <dir>]
pikacss prepare [--cwd <dir>] [--config <file>]
```

The Nuxt-owned `pikacss prepare` directly invokes the shared PikaCSS generated-state preparation with `@pikacss/nuxt-pikacss` as the public entry identity. It is **PikaCSS-only preparation** and does not redirect to `nuxt prepare`.

`nuxt prepare` remains the broader Nuxt framework preparation lifecycle. The module registers a `prepare:types` hook that invokes the same shared PikaCSS preparation operation, materializes the canonical generated declaration, and references that declaration from Nuxt's app, node, and shared TypeScript contexts. The same Nuxt type lifecycle is available to normal `nuxt dev` and `nuxt build` startup; users do not need a second PikaCSS-specific prepare step. The two CLI commands are still not aliases.

## Config

The Nuxt module intentionally exposes only the project config selector. Nuxt itself supplies the immutable project root from `nuxt.options.rootDir`; project semantics remain in the PikaCSS config rather than being duplicated as module options.

| Property | Type | Description |
|---|---|---|
| `config` | `string?` | Optional explicit PikaCSS config file. Relative paths are resolved from the Nuxt project root. When omitted, canonical project-root discovery is used. |

There is no Nuxt-level `cwd`, scan, function-name, Typegen, generated-state, or report option surface. Configure project semantics in the canonical PikaCSS config.

## Next

- [Unplugin](/integrations/unplugin) — use PikaCSS with other bundlers.
- [Setup](/getting-started/setup) — basic project setup.
