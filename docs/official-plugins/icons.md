---
title: Icons
description: Resolve icon shortcut classes via Iconify with the icons plugin.
relatedPackages:
  - '@pikacss/plugin-icons'
relatedSources:
  - 'packages/plugin-icons/src/index.ts'
  - 'packages/plugin-icons/src/node.ts'
  - 'packages/plugin-icons/src/watchable.ts'
category: official-plugins
order: 30
---

# Icons

Resolve icon shortcut classes into CSS via Iconify integration.

The icons plugin resolves shortcut patterns like `i-mdi:home` into CSS declarations that display icons using `mask-image` or `background-image`. Resolution checks custom collections first, then an active local-loader capability, then an optional CDN fallback.

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

Bundler config normally runs in Node.js. Use the `/node` entry when you want PikaCSS's built-in loader for installed `@iconify-json/*` packages or `autoInstall`. The package-root `icons()` factory stays platform-neutral for custom collections and configured CDN sources; custom hosts can instead inject their own runtime capabilities with `createIconsPlugin(runtime)`.

For the setup below, install the collection that the usage example references:

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

<<< @/.examples/official-plugins/icons.setup.example.ts

Usage:

```ts
// Use an icon from the installed @iconify-json/mdi collection
pika('i-mdi:home')

// Force mask mode (colorable with currentColor)
pika('i-mdi:home?mask')

// Force background mode
pika('i-mdi:home?bg')
```

## Config

| Property | Description |
|---|---|
| prefix | Shortcut prefix(es) that trigger icon resolution, e.g. `'i-'`. |
| mode | CSS rendering technique: `'mask'` (colorable via `currentColor`), `'bg'` (background-image), or `'auto'`. |
| scale | Passed to Iconify when `unit` is omitted, scaling the dimensions it resolves from the source. For Iconify JSON collections, this includes Iconify's `1em` fallback when no dimensions are available. With `unit`, it supplies the numeric part of `${scale}${unit}`. |
| collections | Custom icon collections resolved before local or CDN sources. `defineWatchableIconCollection` can register collection-wide dependencies and per-icon dependencies for members enumerable during Engine initialization. |
| customizations | Iconify SVG customizations applied during icon loading. The plugin's `unit` filler runs in `iconCustomizer` before Iconify applies `customizations.additionalProps`; `extraProperties` are merged into those additional properties afterward. |
| autoInstall | When enabled, the built-in Node loader can install a missing `@iconify-json/*` package on demand. With `cwd: string[]`, roots are searched in order and the built-in Iconify node loader attempts auto-install only for the final root. Use `/node`; local loading is skipped when `process.env.ESLINT` is set. |
| cwd | `string \| string[]` search root(s) for the local loader. Array entries are searched in order; the built-in node loader only attempts `autoInstall` for the final entry. Relative entries resolve from the Engine host project root, omitted `cwd` uses that root, and standalone use falls back to the current working directory. Requires `/node` or an equivalent custom local-loader capability. |
| cdn | CDN URL template for fetching remote icon collections as a fallback. |
| unit | After the user's `iconCustomizer`, the plugin fills each missing or falsy width/height with `${scale}${unit}`. Iconify then applies `customizations.additionalProps`; `extraProperties` are merged afterward and win on duplicate keys. Explicit dimensions take precedence over source dimensions, while a single dimension can cause Iconify to derive the other from the SVG aspect ratio. |
| extraProperties | Additional icon properties passed to Iconify and forwarded into every generated icon style item. They override duplicate keys in `customizations.additionalProps`, including `width` and `height`. |
| processor | Post-processing hook invoked after the icon CSS style item is built. `meta.name` is the parsed/requested icon name carried through resolution, not necessarily a canonical catalog key or alias target. |
| autocomplete | Explicit unprefixed logical icon identifiers (e.g. `mdi:home`; omit the configured shortcut prefix) to add to IDE completions. Each entry is combined with every configured prefix. Enumerable custom/filesystem catalogs also contribute names; built-in `/node` discovery uses the nearest governing `package.json` for each root and only its `dependencies`, `devDependencies`, and `optionalDependencies`, not peer dependencies or ancestor manifests. |

When no explicit dimensions remain, Iconify uses the dimensions it resolves from the source and applies `scale`; for Iconify JSON collections, that includes its `1em` fallback when no dimensions are available. This source sizing rule is separate from the generated CSS `background-size`/mask sizing.

> See [API Reference — Plugin Icons](/api/plugin-icons) for the generated public API signatures and defaults, including public package subpaths such as `/node`.

## Watchable Custom Collections

Ordinary `collections` entries are opaque to PikaCSS: an arbitrary loader may read any file, so PikaCSS cannot infer a complete watch set. Wrap an entry with `defineWatchableIconCollection` to declare filesystem dependencies explicitly. Collection-wide paths are registered during Engine initialization. A per-icon dependency function becomes watch metadata only for concrete members that an authoritative enumerable catalog can discover during initialization. For an opaque request-only loader, the function still resolves paths and passes them to the loader, but those paths are **not** late-registered or watched after the Engine dependency set is finalized.

`defineWatchableIconCollection` itself is platform-neutral. This complete example uses a collection-wide catalog file, so the declared dependency genuinely participates in the watch set:

```ts
import { readFile } from 'node:fs/promises'
import { defineWatchableIconCollection, icons } from '@pikacss/plugin-icons'
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  engine: {
    plugins: [icons()],
    icons: {
      collections: {
        app: defineWatchableIconCollection({
          dependencies: './icons/app.json',
          async source(name, { dependencies: [catalogFile] }) {
            const catalog = JSON.parse(await readFile(catalogFile, 'utf8')) as Record<string, string>
            return catalog[name]
          },
        }),
      },
    },
  },
})
```

Relative dependency paths resolve from the Engine host's effective project root. `dependencies` accepts a single path or array (collection-wide, registered at initialization) or a function of `{ collection, name }` (per-icon). The function form is exhaustive only when PikaCSS also has an authoritative enumerable catalog for the concrete members.

For the common one-file-per-icon directory layout, use the `/node` helper instead of an opaque request-only loader. It enumerates the directory during initialization, registers directory membership plus the known member files, and maps `i-app:home` to `<projectRoot>/icons/home.svg`. File create/delete/rename or content/existence changes can therefore re-derive the generation, and the new Engine generation observes fresh file contents:

```ts
import { fileSystemIconCollection, icons } from '@pikacss/plugin-icons/node'
import { defineConfig } from '@pikacss/unplugin-pikacss'

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

The descriptor returned by `defineWatchableIconCollection` or `fileSystemIconCollection` is definition identity. Pass it into `icons.collections` **unmodified**. Do not copy it with object spread: spreading turns it into a plain object, and Core's config clone will drop the private capability brand, silently downgrading it to an ordinary opaque collection.

Trade-off: plain (unwrapped) collections remain fully supported but unwatchable, and a private cache captured inside your own loader is outside PikaCSS's invalidation guarantee.

## Processor Metadata

`processor` receives the mutable generated style item and metadata describing the resolved icon:

```ts
import { icons } from '@pikacss/plugin-icons/node'
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  engine: {
    plugins: [icons()],
    icons: {
      processor(styleItem, meta) {
        // meta.collection: resolved Iconify collection
        // meta.name: parsed/requested name; it may differ from an alias target
        // meta.svg: loaded SVG source
        // meta.source: 'custom' | 'local' | 'cdn'
        // meta.mode: final 'mask' or 'bg' mode after resolving 'auto'
      },
    },
  },
})
```

The callback may mutate `styleItem` to inject or replace declarations before the shortcut result is returned. `meta.name` is the name parsed from the request and carried through resolution; Iconify name normalization or alias matching does not replace it with a canonical catalog key.

## Loading and Retry Behavior

Resolution checks custom collections first, then the active local-loader capability, then the configured CDN. The `/node` adapter supplies the built-in local loader for installed Iconify packages; it deliberately skips that local-loading/install path when `process.env.ESLINT` is set. Custom collections and CDN resolution are unaffected by that guard. When a loader returns no icon, the plugin logs a warning but does not cache a permanent miss. A rejection from the active local-loader capability propagates to its caller, while the rejected per-icon entry is evicted so a later resolution retries. Failed CDN collection requests are handled as misses and removed from the collection cache before the next attempt.

Plain (unwrapped) custom collection values are opaque Iconify loader functions or inline SVG maps: their backing file paths are not known to PikaCSS and are not registered as config dependencies, so editing those files does not automatically trigger a config reload — restart the dev process or touch the PikaCSS config after changing them. To make known filesystem inputs participate in dependency watching, use `defineWatchableIconCollection`; for a one-file-per-icon directory under Node.js, prefer `fileSystemIconCollection` (see [Watchable Custom Collections](#watchable-custom-collections) above).

## Next

- [Fonts](/official-plugins/fonts) — web font loading and management.
- [Reset](/official-plugins/reset) — CSS reset stylesheets.
