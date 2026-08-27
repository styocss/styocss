---
title: Icons
description: Resolve icon shortcut classes via Iconify with the icons plugin.
relatedPackages:
  - '@pikacss/plugin-icons'
relatedSources:
  - 'packages/plugin-icons/src/index.ts'
category: official-plugins
order: 30
---

# Icons

Resolve icon shortcut classes into CSS via Iconify integration.

The icons plugin resolves shortcut patterns like `i-mdi:home` into CSS declarations that display icons using `mask-image` or `background-image`. Icons are loaded from three sources in order: custom collections, locally installed `@iconify-json/*` packages, and an optional CDN fallback.

::: code-group

```sh [pnpm]
pnpm add -D @pikacss/plugin-icons
```

```sh [npm]
npm install -D @pikacss/plugin-icons
```

```sh [yarn]
yarn add -D @pikacss/plugin-icons
```

:::

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'
import { icons } from '@pikacss/plugin-icons'

export default defineConfig({
  engine: {
  plugins: [icons()],
  icons: {
    prefix: 'i-',
    mode: 'auto',
  },
  },
})
```

Usage:

```ts
// Use an icon
pika('i-mdi:home')

// Force mask mode (colorable with currentColor)
pika('i-mdi:home?mask')

// Force background mode
pika('i-mdi:home?bg')
```

Install icon collections as needed:

::: code-group

```sh [pnpm]
pnpm add -D @iconify-json/mdi
```

```sh [npm]
npm install -D @iconify-json/mdi
```

```sh [yarn]
yarn add -D @iconify-json/mdi
```

:::

## Config

| Property | Description |
|---|---|
| prefix | Shortcut prefix(es) that trigger icon resolution, e.g. `'i-'`. |
| mode | CSS rendering technique: `'mask'` (colorable via `currentColor`), `'bg'` (background-image), or `'auto'`. |
| scale | Scaling factor applied to icon SVGs. Combined with `unit` for final dimensions. |
| collections | Custom icon collections resolved before local or CDN sources. Wrap entries with `defineWatchableIconCollection` to opt into dependency watching. |
| customizations | Iconify SVG customizations applied during icon loading. |
| autoInstall | When `true`, auto-installs missing `@iconify-json/*` packages on first use. |
| cwd | Working directory for resolving locally installed icon packages. |
| cdn | CDN URL template for fetching remote icon collections as a fallback. |
| unit | CSS unit appended to icon dimensions, e.g. `'em'`. |
| extraProperties | Additional CSS properties injected into every icon's style declaration. |
| processor | Post-processing hook invoked after the icon CSS style item is built. |
| autocomplete | Extra icon names to include in IDE autocomplete suggestions. |

> See [API Reference — Plugin Icons](/api/plugin-icons) for full type signatures and defaults.

## Watchable Custom Collections

Ordinary `collections` entries are opaque to PikaCSS: an arbitrary loader may read any file, so edits to local SVGs cannot trigger a rebuild. Wrap an entry with `defineWatchableIconCollection` to declare its filesystem dependencies explicitly — they are registered with the engine **before** each load (a missing file stays a known, watchable identity, so creating or fixing it later recovers without a restart), relative paths resolve from your bundler's project root, and dependencies discovered mid-run are pushed to the running dev watcher dynamically:

```ts
import { defineWatchableIconCollection, icons } from '@pikacss/plugin-icons/node'

export default defineConfig({
  engine: {
  plugins: [icons()],
  icons: {
    collections: {
      app: defineWatchableIconCollection({
        source: async (name, { dependencies: [file] }) => loadSvgYourWay(file),
        dependencies: ({ name }) => `./icons/${name}.svg`,
      }),
    },
  },
  },
})
```

`dependencies` accepts a single path or array (collection-wide, registered at engine configuration time) or a function of `{ collection, name }` (per-icon). For the common one-file-per-icon directory layout, the `/node` entry ships a ready-made helper — `i-app:home` resolves `<projectRoot>/icons/home.svg`, contents are read fresh on every resolution, and edits/deletions/recreations refresh the generated CSS through the normal dependency lifecycle:

```ts
import { fileSystemIconCollection, icons } from '@pikacss/plugin-icons/node'

export default defineConfig({
  engine: {
  plugins: [icons()],
  icons: {
    collections: {
      app: fileSystemIconCollection({ dir: './icons' }),
    },
  },
  },
})
```

Trade-off: plain (unwrapped) collections remain fully supported but unwatchable, and a private cache captured inside your own loader is outside PikaCSS's invalidation guarantee.

## Processor Metadata

`processor` receives the mutable generated style item and metadata describing the resolved icon:

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'
import { icons } from '@pikacss/plugin-icons'

export default defineConfig({
  engine: {
  plugins: [icons()],
  icons: {
    processor(styleItem, meta) {
      // meta.collection: resolved Iconify collection
      // meta.name: resolved icon name
      // meta.svg: loaded SVG source
      // meta.source: 'custom' | 'local' | 'cdn'
      // meta.mode: final 'mask' or 'bg' mode after resolving 'auto'
    },
  },
  },
})
```

The callback may mutate `styleItem` to inject or replace declarations before the shortcut result is returned.

## Loading and Retry Behavior

Resolution checks custom collections first, then locally installed packages, then the configured CDN. A missing or temporarily unavailable icon logs a warning but is not cached as a permanent miss. Later resolutions retry the load, and failed CDN requests are removed from the collection cache before the next attempt.

Plain (unwrapped) custom collection values are opaque Iconify loader functions or inline SVG maps: their backing file paths are not known to PikaCSS and are not registered as config dependencies, so editing those files does not automatically trigger a config reload — restart the dev process or touch the PikaCSS config after changing them. To make backing files watchable, wrap the entry with `defineWatchableIconCollection` (see [Watchable Custom Collections](#watchable-custom-collections) above).

## Next

- [Fonts](/official-plugins/fonts) — web font loading and management.
- [Reset](/official-plugins/reset) — CSS reset stylesheets.
