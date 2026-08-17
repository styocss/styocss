# Plugin: Icons

> Read this when the user asks about icon shortcuts, Iconify collections, local versus remote resolution, rendering modes, processor hooks, autocomplete, or missing icons.

## Installation

```bash
pnpm add -D @pikacss/plugin-icons
```

Install individual Iconify collections when local package resolution is desired:

```bash
pnpm add -D @iconify-json/lucide
pnpm add -D @iconify-json/mdi
```

## Choose the Correct Entry

The package has platform-neutral and Node.js entries:

| Import | Capabilities |
|---|---|
| `@pikacss/plugin-icons` | Custom collections and configured CDN sources |
| `@pikacss/plugin-icons/node` | Everything above plus locally installed `@iconify-json/*` packages and `autoInstall` |

Bundler config normally runs in Node.js, so use `/node` when users expect installed icon collections to resolve:

```ts
// pika.config.ts
import { defineEngineConfig } from '@pikacss/core'
import { icons } from '@pikacss/plugin-icons/node'

export default defineEngineConfig({
  plugins: [icons()],
})
```

Using the neutral entry with only a locally installed collection does not load that package. It needs a custom collection, a CDN, or a custom runtime capability.

## Usage

Icons are shortcuts with the form `i-{collection}:{name}`:

```ts
pika('i-lucide:rocket')
pika('i-mdi:home')
pika('i-lucide:rocket', { width: '24px', height: '24px' })
```

Force a rendering mode per icon with a suffix:

```ts
pika('i-mdi:home?mask')
pika('i-mdi:home?bg')
pika('i-mdi:home?auto')
```

## Resolution Order

1. Custom collections from `icons.collections`.
2. Locally installed packages when the Node adapter is active.
3. The configured CDN.

A missing or temporarily unavailable icon is reported but not permanently cached as a miss. Later resolutions retry, and failed CDN collection requests are removed from the cache before the next attempt.

## Configuration

Set options under the top-level `icons` key:

| Option | Type | Default | Purpose |
|---|---|---|---|
| `prefix` | `string \| string[]` | `'i-'` | One or more shortcut prefixes |
| `mode` | `'auto' \| 'mask' \| 'bg'` | `'auto'` | Rendering strategy |
| `scale` | `number` | `1` | Intrinsic size multiplier |
| `collections` | `CustomCollections` | — | Custom SVG maps or loaders |
| `customizations` | `IconCustomizations` | `{}` | Iconify SVG transformation hooks |
| `autoInstall` | Iconify loader option | `false` | Install missing local collections; requires `/node` |
| `cwd` | Iconify loader option | — | Working directory for local package lookup; requires `/node` |
| `cdn` | `string` | — | CDN template with `{collection}`, or a base URL |
| `unit` | `string` | — | Explicit dimension unit such as `em` |
| `extraProperties` | `Record<string, string>` | `{}` | CSS merged into every generated icon style |
| `processor` | `(styleItem, meta) => void` | — | Mutate each generated style item using resolved metadata |
| `autocomplete` | `string[]` | — | Explicit icon identifiers for generated completions |

```ts
export default defineEngineConfig({
  plugins: [icons()],
  icons: {
    mode: 'auto',
    scale: 1,
    autocomplete: ['lucide:rocket', 'mdi:home'],
    extraProperties: {
      display: 'inline-block',
      verticalAlign: 'middle',
    },
  },
})
```

## Rendering Modes

- `auto`: uses `mask` when the resolved SVG contains `currentColor`; otherwise uses `bg`.
- `mask`: emits a CSS mask and follows `currentColor`.
- `bg`: emits a background image and preserves the SVG's original colors.

Do not describe `auto` merely as “monochrome versus colored”; the implementation decision is specifically based on the resolved SVG containing `currentColor`.

## Processor Metadata

`processor` receives the mutable generated style item and resolved metadata:

```ts
export default defineEngineConfig({
  plugins: [icons()],
  icons: {
    processor(styleItem, meta) {
      // meta.collection: resolved Iconify collection
      // meta.name: resolved icon name
      // meta.svg: loaded SVG source
      // meta.source: 'custom' | 'local' | 'cdn'
      // meta.mode: final 'mask' or 'bg' mode

      if (meta.source === 'cdn' && typeof styleItem !== 'string')
        Object.assign(styleItem, { opacity: '0.95' })
    },
  },
})
```

The callback mutates `styleItem` in place before the shortcut result is returned. Although generated icon styles are objects at runtime, the public callback type is `StyleItem`, so examples should narrow away the string case before property mutation.

## Custom Collections and Reloading

PLAIN (unwrapped) custom collection values are opaque Iconify loader functions or inline SVG maps. PikaCSS cannot infer the backing file path of a loader, so editing a file used inside a plain custom loader does not automatically trigger config reload.

When a custom collection reads external files, prefer wrapping it with `defineWatchableIconCollection` (see "Watchable Custom Collections (#122)" below) — it registers the declared files as config dependencies before every load, including mid-run discoveries. Only fall back to restarting/touching the config for loaders whose file access genuinely cannot be declared.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Installed collection is ignored | Neutral entry used | Import from `@pikacss/plugin-icons/node` |
| `autoInstall` has no effect | Neutral entry or disabled package installation | Use `/node` and verify the environment permits installs |
| Icon not found locally | Collection package absent or wrong cwd | Install `@iconify-json/{collection}` and verify `icons.cwd` |
| CDN icon does not load | No CDN configured, bad template, or transient request failure | Configure `icons.cdn`; a later resolution retries failures |
| Icon has wrong color behavior | Rendering mode mismatch | Use `?mask`, `?bg`, or set `icons.mode` |
| Icon size is unexpected | No explicit unit or scale | Set `unit`/`scale`, or add width and height in `pika()` |
| Editor completion is too broad or missing concrete names | No explicit completion list | Add `icons.autocomplete` entries |

## Watchable Custom Collections (#122)

Ordinary `collections` entries are opaque/unwatchable. `defineWatchableIconCollection({ source, dependencies })` (neutral entry) declares filesystem dependencies: registered with the engine BEFORE each load (missing files stay watchable identities), relative paths resolved from the engine host's project root, mid-run discoveries pushed to the running bundler watcher via the generic `configDependencyAdded` pipeline. `dependencies` = string | string[] (collection-wide, registered at configure time) | ({ collection, name }) => path(s) (per-icon). The `/node` entry adds `fileSystemIconCollection({ dir, extension? })` — one file per icon, fresh read every resolution, no SVG cache across engine re-derivations. Private caches inside user loaders stay outside PikaCSS's invalidation guarantee.
