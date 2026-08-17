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
When you use `@pikacss/nuxt-pikacss`, do not also register `@pikacss/unplugin-pikacss/vite` manually in `vite.config.ts`. The Nuxt module already wires the Vite plugin and generates a Nuxt plugin template that imports `pika.css`.
:::

## What the Module Does

### Vite Plugin Registration

The module automatically registers `@pikacss/unplugin-pikacss/vite` with `enforce: 'pre'`, ensuring style extraction runs before other transformations.

### CSS Auto-Import

The module generates a Nuxt plugin template that imports `pika.css`, so you do not need to manually import the generated CSS file yourself.

### Default Scan Patterns

The module inherits the unplugin default scan patterns: `**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,vue}`, excluding `node_modules`, `dist`, `.git`, `.nuxt`, `.output`, and `coverage`. Configure the `scan` option to customize file patterns.

## Config

The Nuxt module accepts all [Unplugin options](/integrations/unplugin#config) except `currentPackageName` (the module supplies it), with Nuxt-specific defaults applied automatically.

| Property | Description |
|---|---|
| cwd | Explicit working directory for path resolution. Overrides the bundler-detected project root. |
| scan | File glob patterns controlling which source files are scanned for `pika()` call sites. |
| config | PikaCSS engine configuration, either as an inline object or a path to a config module. |
| autoCreateConfig | When `true`, auto-creates a `pika.config.js` file if none is found. Default: `false`. |
| fnName | Function identifier the scanner looks for when extracting call sites. Default: `'pika'`. |
| transformedFormat | Output shape of transformed `pika()` calls: `'string'` or `'array'`. |
| tsCodegen | Controls TypeScript type-definition code generation. |

> See [API Reference — Nuxt](/api/nuxt) for full type signatures and defaults.

## Next

- [Unplugin](/integrations/unplugin) — use PikaCSS with other bundlers.
- [Setup](/getting-started/setup) — basic project setup.
