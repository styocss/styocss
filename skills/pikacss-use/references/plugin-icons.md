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
| `@pikacss/plugin-icons` | Platform-neutral `icons()` for custom collections/CDN, plus `createIconsPlugin(runtime)` for host-supplied capabilities |
| `@pikacss/plugin-icons/node` | Everything above plus PikaCSS's built-in loader/catalog discovery for locally installed `@iconify-json/*` packages and `autoInstall` |

Bundler config normally runs in Node.js, so use `/node` when users expect installed icon collections to resolve:

```ts
// pika.config.ts
import { icons } from '@pikacss/plugin-icons/node'
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  engine: {
    plugins: [icons()],
  },
})
```

Using the package-root `icons()` factory with only a locally installed collection does not load that package. It needs a custom collection, a CDN, or a custom runtime capability supplied through `createIconsPlugin(runtime)`.

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
2. An active local-loader capability. The `/node` entry supplies PikaCSS's built-in local loader.
3. The configured CDN.

A missing icon is reported but not permanently cached as a miss. A rejection from the active local-loader capability propagates to its caller, and its rejected per-icon cache entry is evicted so a later resolution retries. Failed CDN collection requests are handled as misses and removed from the collection cache before the next attempt.

## Configuration

Set options under the top-level `icons` key:

| Option | Type | Default | Purpose |
|---|---|---|---|
| `prefix` | `string \| string[]` | `'i-'` | One or more shortcut prefixes |
| `mode` | `'auto' \| 'mask' \| 'bg'` | `'auto'` | Rendering strategy |
| `scale` | `number` | `1` | Passed to Iconify when `unit` is omitted to scale source-resolved dimensions; for Iconify JSON collections, this includes the `1em` fallback. With `unit`, it supplies the numeric part of `${scale}${unit}` |
| `collections` | `Record<string, CustomIconLoader \| InlineCollection \| WatchableIconCollection>` | — | Custom SVG maps/loaders or branded watchable descriptors |
| `customizations` | `IconCustomizations` | `{}` | Iconify SVG transformation hooks; plugin `unit` runs in `iconCustomizer` before `additionalProps`, and `extraProperties` are merged afterward |
| `autoInstall` | Iconify loader option | `false` | Built-in Node loader installs missing local collections; with `cwd: string[]`, roots are searched in order and auto-install is attempted only for the final root; requires `/node` and is skipped under `process.env.ESLINT` |
| `cwd` | `string \| string[]` | — | Local-loader search roots searched in order; the built-in node loader only attempts `autoInstall` for the final entry. Relative/default values use the Engine host project root; requires `/node` or equivalent custom capability |
| `cdn` | `string` | — | CDN template with `{collection}`, or a base URL |
| `unit` | `string` | — | After the user's `iconCustomizer`, fill each missing/falsy width/height with `${scale}${unit}`. Iconify then applies `customizations.additionalProps`, and `extraProperties` win on duplicate keys; a single explicit dimension may be completed from the SVG aspect ratio |
| `extraProperties` | `Record<string, string>` | `{}` | Iconify properties forwarded into every generated icon style; duplicate keys, including `width`/`height`, override `customizations.additionalProps` |
| `processor` | `(styleItem, meta) => void` | — | Mutate each generated style item; `meta.name` is the parsed/requested name, not guaranteed to be a canonical catalog key or alias target |
| `autocomplete` | `string[]` | — | Explicit unprefixed logical icon identifiers added to generated completions; each entry is combined with every configured prefix |

```ts
import { icons } from '@pikacss/plugin-icons/node'
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  engine: {
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
  },
})
```

`autocomplete` is additive rather than the only source of concrete names. Enumerable inline/watchable catalogs and `fileSystemIconCollection` contribute concrete completions. The built-in `/node` catalog discovery uses the nearest governing `package.json` for each search root and only its `dependencies`, `devDependencies`, and `optionalDependencies`; peer dependencies and ancestor manifests are not catalog-completion sources, even when Node resolution could load a package from them.

When no explicit dimensions remain, Iconify uses the dimensions it resolves from the source and applies `scale`; for Iconify JSON collections, that includes its `1em` fallback when no dimensions are available.

## Rendering Modes

- `auto`: uses `mask` when the resolved SVG contains `currentColor`; otherwise uses `bg`.
- `mask`: emits a CSS mask and follows `currentColor`.
- `bg`: emits a background image and preserves the SVG's original colors.

Do not describe `auto` merely as “monochrome versus colored”; the implementation decision is specifically based on the resolved SVG containing `currentColor`.

## Processor Metadata

`processor` receives the mutable generated style item and resolved metadata:

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
        // meta.mode: final 'mask' or 'bg' mode

        if (meta.source === 'cdn' && typeof styleItem !== 'string')
          Object.assign(styleItem, { opacity: '0.95' })
      },
    },
  },
})
```

The callback mutates `styleItem` in place before the shortcut result is returned. `meta.name` is the name parsed from the request and carried through resolution; Iconify normalization or alias matching does not replace it with a canonical catalog key. Although generated icon styles are objects at runtime, the public callback type is `StyleItem`, so examples should narrow away the string case before property mutation.

## Custom Collections and Reloading

PLAIN (unwrapped) custom collection values are opaque Iconify loader functions or inline SVG maps. PikaCSS cannot infer the backing file path of a loader, so editing a file used inside a plain custom loader does not automatically trigger config reload.

When a custom collection reads external files, use `defineWatchableIconCollection` only for inputs that can participate in the initialization-time dependency set. Collection-wide dependencies are registered immediately. Per-icon dependency callbacks are registered only for members enumerable at initialization; an opaque request-only loader merely receives the resolved paths as loader context and does **not** expand the watcher later. Redesign request-only file layouts around an enumerable catalog, use `fileSystemIconCollection` for a Node one-file-per-icon directory, or restart/re-derive the project when opaque inputs change.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Installed collection is ignored | Package-root `icons()` used | Import `icons` from `@pikacss/plugin-icons/node`, or provide a custom local loader |
| `autoInstall` has no effect | Neutral entry, ESLint mode, or disabled package installation | Use `/node` outside the ESLint loading path and verify the environment permits installs |
| Icon not found locally | Collection package absent or wrong cwd | Install `@iconify-json/{collection}` and verify `icons.cwd` |
| CDN icon does not load | No CDN configured, bad template, or transient request failure | Configure `icons.cdn`; a later resolution retries failures |
| Icon has wrong color behavior | Rendering mode mismatch | Use `?mask`, `?bg`, or set `icons.mode` |
| Icon size is unexpected | Iconify intrinsic/default dimensions or configured scale/unit differ from expectation | Set `unit`/`scale`, or add width and height in `pika()` |
| Editor completion is missing a concrete name | The source is not enumerable/discovered and the name is not explicit | Add `icons.autocomplete`, or expose an enumerable catalog/direct local package |

## Watchable Custom Collections (#122)

Ordinary `collections` entries remain opaque/unwatchable. `defineWatchableIconCollection({ source, dependencies })` declares filesystem inputs for deterministic catalog members during Engine initialization. Collection-wide `string | string[]` dependencies are registered immediately; per-icon dependency callbacks become Engine dependencies only for members enumerable from an inline/watchable object or filesystem catalog. Opaque request-only callbacks still receive absolute dependency paths, but those paths are not registered or watched after initialization. Relative paths resolve from the Engine host project root. The finalized dependency set is frozen with the Engine generation — runtime icon resolution never expands the active watcher. The `/node` entry adds `fileSystemIconCollection({ dir, extension? })`, whose direct directory membership is itself an initialization dependency so create/delete/rename re-derives the generation and a new Engine generation observes fresh contents. Pass either branded descriptor through unmodified: **never object-spread it**, because doing so can drop the private brand during Core config cloning and silently remove watchability. Private caches inside user loaders stay outside PikaCSS invalidation guarantees.
