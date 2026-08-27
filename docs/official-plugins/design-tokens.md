---
title: Design Tokens
description: Convert W3C design tokens and design.md documents into CSS variables, with external aliases, multi-theme sources, autocomplete, and strict-mode governance.
relatedPackages:
  - '@pikacss/plugin-design-tokens'
relatedSources:
  - 'packages/plugin-design-tokens/src/types.ts'
  - 'packages/plugin-design-tokens/src/node.ts'
  - 'packages/plugin-design-tokens/src/load.ts'
  - 'packages/plugin-design-tokens/src/dtcg.ts'
  - 'packages/plugin-design-tokens/src/external.ts'
  - 'packages/plugin-design-tokens/src/strict.ts'
  - 'packages/plugin-design-tokens/src/autocomplete.ts'
  - 'packages/plugin-design-tokens/src/report.ts'
  - 'packages/plugin-design-tokens/src/index.ts'
category: official-plugins
order: 50
---

# Design Tokens

Convert design tokens into CSS variables through the engine's `variables` system.

The design tokens plugin reads token sources — inline objects, W3C Design Tokens (DTCG) JSON files, or markdown design documents — flattens them into CSS variables, and merges them into the engine's `variables` config. Because tokens flow through the core `variables` system, they inherit unused-pruning, IDE autocomplete, and selector scoping. Token source file paths are registered as engine config dependencies — even when the file is missing — so build-tool integrations reload when a token file changes or is created later.

::: code-group

```sh [pnpm]
pnpm add -D @pikacss/plugin-design-tokens
```

```sh [npm]
npm install -D @pikacss/plugin-design-tokens
```

```sh [yarn]
yarn add -D @pikacss/plugin-design-tokens
```

:::

## Choosing an Entry

The plugin ships two entry points. Which one you import decides whether **file-backed** token sources can be read:

- `@pikacss/plugin-design-tokens/node` — the Node.js adapter. It injects `node:fs` and `process.cwd()`, so file sources (`.json`, `.md`, and custom loaders) are read from disk. Use this in any bundler or Node build (Vite, webpack, Nuxt, …).
- `@pikacss/plugin-design-tokens` — the platform-neutral entry. It accepts **inline token objects only**. A file source passed here is warned about and skipped, because no filesystem capability is installed. Use it in non-Node hosts, or pass a custom runtime capability (`designTokens({ readFile, cwd })`).

Most projects import from `/node`:

<<< @/.examples/official-plugins/design-tokens.setup.example.ts

Configure the plugin through the top-level `designTokens` engine config key.

Usage: reference the generated variables from regular `pika()` calls. Tokens are pruned when unused by default, so only referenced variables are emitted:

::: code-group

<<< @/.examples/official-plugins/design-tokens.usage.example.pikain.ts [Input]

<<< @/.examples/official-plugins/design-tokens.usage.example.pikaout.css [Output]

:::

## Token Sources

`sources` accepts a single source or an array of sources. Each source is either an inline token group object or a file path. Relative paths resolve against the effective token root: an absolute `root` is used as-is, a relative `root` resolves from the engine host's project root (e.g. the Vite root or Nuxt `rootDir` your bundler integration supplies), and when `root` is omitted the project root itself is used. Standalone `createEngine()` use without a host context falls back to `process.cwd()` under the `/node` entry (`'.'` when no runtime capability is provided). Later sources override earlier ones when variable names collide. Unreadable or invalid sources are skipped with a warning instead of failing engine creation; a file source read through the neutral entry (no `readFile` capability) is likewise warned about and skipped.

### JSON Token Files

Any file path that does not end in `.md` is parsed as a W3C Design Tokens JSON file. A node with a `$value` property is a token; any other object is a nested group. `$`-prefixed group metadata keys (such as `$description`) are skipped:

```json
{
	"color": {
		"primary": { "$value": "#3b82f6", "$type": "color" },
		"accent": { "$value": "{color.primary}" }
	}
}
```

### Markdown Design Documents

File paths ending in `.md` are parsed as design documents. Only fenced code blocks whose info string starts with `tokens` are read; all other markdown content is ignored, so tokens can live inside your design documentation. Block content must be valid JSON in the W3C Design Tokens format:

````md
# Buttons

Primary buttons use the brand color.

```tokens
{ "color": { "primary": { "$value": "#3b82f6" } } }
```

The dark theme swaps in a lighter shade.

```tokens theme=dark selector=".dark"
{ "color": { "primary": { "$value": "#60a5fa" } } }
```
````

The info string may carry two attributes:

- `theme=<name>` — assigns the block's tokens to a theme instead of the base `:root` scope.
- `selector=<css-selector>` — overrides the theme selector for that block. Values may be quoted with `"` or `'`. A fence `selector` takes precedence over the selector configured under `themes`.

### Per-Source Prefix and Layer

A source may be a bare source or a `DesignTokensSourceEntry` object that carries its own `prefix` and `layer`. An object is treated as a source entry when it has an own `source` property; otherwise it is read as an inline token group. Use the entry form to namespace one vendor file, or to tag a source's architectural layer:

```ts
designTokens: {
	sources: [
		'./app.tokens.json',
		{ source: './vendor.tokens.json', prefix: 'syno', layer: 'semantic' },
	],
}
```

- `prefix` overrides the top-level [`prefix`](#config) for that source's emitted variable names and its own `{a.b.c}` alias resolution. A cross-source `$ref` into this source uses this prefix for the emitted name.
- `layer` is `'primitive'` (raw values — a palette, a spacing scale) or `'semantic'` (values mapped to intent — `surface`, `text`). The layer is recorded on the generated variables' internal registry; it does not affect the emitted CSS, but [strict mode](#strict-mode) can enforce that authored styles reference only semantic tokens.

::: info
To use an inline token group whose top level literally contains a token or group named `source`, wrap it in an entry: `{ source: <group> }`.
:::

## DTCG Ingestion

Every loaded source is canonicalized by a built-in DTCG normalizer before it is flattened. This adds three W3C Design Tokens features on top of plain `$value` parsing:

- **`$ref` JSON pointers** — a node that carries `$ref` (and no `$value`) is a token expressed purely as a reference, written as a JSON pointer like `"file#/color/primary"` or, for a same-file reference, `"#/color/primary"`. It is rewritten into an alias to the target's emitted variable, so cross-file references resolve to the target source's prefix. Malformed pointers (bad syntax, non-string `$ref`, unknown source, missing target, circular chain) are warned about and skipped — never thrown or looped.
- **Group-level `$type`** — a `$type` set on a group flows down onto every descendant token, unless a token sets its own `$type` (token wins). This drives [autocomplete](#autocomplete) and [strict-mode](#strict-mode) governance without repeating `$type` on every leaf.
- **Group-level `$deprecated`** — deprecated tokens still emit their CSS variables, but their variable names are recorded so tooling can warn on usage. A group-level `$deprecated` applies to every descendant unless a token overrides it. Deprecated tokens in use are counted in the [usage report](#usage-report).

::: code-group

<<< @/.examples/official-plugins/design-tokens.dtcg.example.pikain.ts [Input]

<<< @/.examples/official-plugins/design-tokens.dtcg.example.pikaout.css [Output]

:::

Arbitrary `$extensions` metadata is carried through onto the normalized token. The `com.pikacss.design-tokens` namespace is reserved for PikaCSS's own metadata — see [External Aliases](#external-aliases).

## External Aliases

An external alias is a token whose value is owned by another runtime — for example, a design system that already ships its own CSS custom properties (`--guideline-*`) at runtime. Mark such a token with an external-alias marker under `$extensions["com.pikacss.design-tokens"]`:

```json
{
	"surface": {
		"z0": {
			"$type": "color",
			"$value": "var(--guideline-semantic-surface-z0)",
			"$extensions": {
				"com.pikacss.design-tokens": {
					"external": true,
					"var": "--guideline-semantic-surface-z0"
				}
			}
		}
	}
}
```

The marker is authoritative: when both a marker and a `$value` exist, the marker wins, and `var` must be a `--`-prefixed string (an invalid marker is warned about and skipped). External aliases are emitted **only under `:root`** and are never themed — the external runtime owns theming, so an external alias placed in a theme scope is warned about and skipped. This lets your tokens reference a design system's live variables while still flowing through autocomplete, pruning, and strict mode:

::: code-group

<<< @/.examples/official-plugins/design-tokens.external.example.pikain.ts [Input]

<<< @/.examples/official-plugins/design-tokens.external.example.pikaout.css [Output]

:::

## Themes

Base tokens are emitted under `:root`. Theme tokens are emitted under the theme's selector, which defaults to `.<themeName>` and can be overridden via `themes.<name>.selector` (or per-block via the fence `selector` attribute). Theme sources use the same formats as base sources:

```ts
import { defineEngineConfig } from '@pikacss/core'
import { designTokens } from '@pikacss/plugin-design-tokens/node'

export default defineEngineConfig({
	plugins: [designTokens()],
	designTokens: {
		sources: ['./design.tokens.json'],
		themes: {
			dark: {
				selector: '[data-theme="dark"]',
				sources: ['./design.dark.tokens.json'],
			},
		},
	},
})
```

### Multi-Theme From a Single File

When one shared source holds several theme partitions at its top level (e.g. `light-mode`, `dark-mode`), each theme selects its own partition with `from`. The partition key is stripped from token paths, so the emitted variable names stay theme-agnostic (`--surface-z0`, not `--light-mode-surface-z0`). Passing an array of keys merges the selected subtrees (later keys win on collision).

Set `media` to additionally emit a theme's variables inside an `@media` block wrapping `:root`, on top of its selector block — so a theme activates both via an explicit class/attribute and automatically via a user preference:

::: code-group

<<< @/.examples/official-plugins/design-tokens.multi-theme.example.pikain.ts [Input]

<<< @/.examples/official-plugins/design-tokens.multi-theme.example.pikaout.css [Output]

:::

## Token Names and Aliases

Each token path segment is kebab-cased (`fontSize` → `font-size`), then segments are joined with `-` to form the variable name, e.g. `color.primary` → `--color-primary`. When `prefix` is set, it is prepended as the first segment: `--app-color-primary`.

String values may reference other tokens with alias syntax `{path.to.token}`, which resolves to `var(--path-to-token)` using the same normalization and prefix — aliases always point at the emitted variable name. Aliases also work embedded in longer values, e.g. `'1px solid {color.border}'` → `1px solid var(--color-border)`.

## Composite Values

Object and array `$value`s are serialized based on `$type`:

| `$type` | Serialization |
|---|---|
| `shadow` | `[inset] <offsetX> <offsetY> <blur> <spread> <color>` — missing offsets default to `0` |
| `border` | `<width> <style> <color>` |
| `transition` | `<duration> <timingFunction> <delay>` |
| *(arrays, any type)* | Items serialized individually and joined with `, ` (layered shadows, `fontFamily` stacks) |

Object values with any other `$type` (e.g. `typography`) have no single-value serializer. They are expanded into one sub-variable per field: `typography.heading` with `{ fontSize: '2rem' }` becomes `--typography-heading-font-size`.

## Autocomplete

A token whose `$type` is mapped to CSS properties emits `asValueOf` autocomplete for exactly those properties, so the variable is suggested as a `var()` value where it belongs. The built-in map covers common DTCG types:

| `$type` | Suggested for |
|---|---|
| `color` | `color`, `background-color`, `border-color`, `outline-color`, `fill`, `stroke` |
| `dimension` | `width`, `height`, `min/max-width`, `min/max-height`, `margin`, `padding`, `gap`, `inset`, `font-size`, `border-radius` |
| `duration` | `transition-duration`, `animation-duration` |
| `fontFamily` | `font-family` |
| `fontWeight` | `font-weight` |
| `number` | `z-index`, `opacity`, `line-height`, `flex-grow`, `flex-shrink`, `order` |
| `shadow` | `box-shadow` |
| `cubicBezier` | `transition-timing-function`, `animation-timing-function` |

`typeAutocomplete` merges over this map per `$type`. Each entry replaces the default list for that `$type`; `false` suppresses value-of suggestions entirely. Tokens without a `$type`, or with a `$type` absent from the merged map, fall back to the core `variables` default (suggested everywhere):

```ts
designTokens: {
	// Suggest `spacing` tokens only for gap/padding/margin; never suggest `z` tokens as values.
	typeAutocomplete: {
		spacing: ['gap', 'padding', 'margin'],
		z: false,
	},
}
```

## Strict Mode

Strict mode governs which literal values are allowed on design-token-governed CSS properties and surfaces violations as diagnostics. A property is *governed* when it appears in the merged `typeAutocomplete` map for a `$type` that has at least one registered token; values on governed properties are validated against that `$type`. Strict mode is opt-in and defaults to off (a near-zero-cost early return), so a valid, token-referencing style passes untouched:

::: code-group

<<< @/.examples/official-plugins/design-tokens.strict.example.pikain.ts [Input]

<<< @/.examples/official-plugins/design-tokens.strict.example.pikaout.css [Output]

:::

```ts
designTokens: {
	strict: {
		level: 'error',
		overrides: { 'background-color': 'warn', dimension: 'off' },
		allowedValues: ['0', /^var\(--legacy-/],
		semanticOnly: true,
		types: true,
	},
}
```

| Option | Behavior |
|---|---|
| `level` | Baseline severity for every governed property: `'off'` (default), `'warn'`, or `'error'`. |
| `overrides` | Per-key severity, keyed by a CSS property name (e.g. `'background-color'`) or a `$type` (e.g. `'color'`). A property-key override beats a `$type`-key override, which beats `level`. |
| `allowedValues` | Extra literals accepted on any governed property, on top of the built-in per-`$type` allowlist (`color`: `transparent`, `currentcolor`; `dimension`: `0`, `auto`) and the CSS-wide keywords. A string is matched exactly against the trimmed value; a `RegExp` is tested against it. |
| `semanticOnly` | When `true` (and `level` is not `'off'`), referencing a `primitive`-layer token in authored styles is a violation — only `semantic`-layer tokens are allowed — and primitive tokens are hidden from autocomplete. |
| `types` | When `true`, narrows the generated `pika.gen.ts` value types (see below). |

A strict violation becomes a `Diagnostic` — `{ level, code, message, plugin: 'design-tokens' }` — reported through the engine's `onDiagnostic` handler while styles are transformed. The engine never throws it. The bundler integration installs a handler that logs every diagnostic live (a `'warning'` surfaces immediately, including in dev), collects the `'error'`-level ones, and **fails the build** by throwing a single aggregated `Error` at `buildEnd` — so an error-severity violation stops a production build. See [Diagnostics and reports](#diagnostics-and-reports) below.

### Compile-Time Type Narrowing

`strict.types` is independent of `level`: it narrows the generated `pika.gen.ts` so invalid literals red-squiggle in the IDE before any build runs. For each governed property, the accepted TypeScript value type becomes an exclusive union of: a `var(--token)` reference (with an optional `var(--token, fallback)` form) for each token of the governing `$type`, the CSS-wide keywords, the built-in allowlist and any string `allowedValues`, and template-literal escape hatches for the functional forms `calc()`, `color-mix()`, `min()`, `max()`, `clamp()`, and `light-dark()`.

::: warning
If any `RegExp` `allowedValues` entry is present, type narrowing is disabled entirely (all properties stay permissive), because an arbitrary `RegExp` cannot be faithfully represented as a literal union without risking rejection of a value the runtime accepts. Runtime diagnostics still apply.
:::

## Custom Loaders and Normalizers

`loaders` and `normalizers` extend ingestion without changing the built-in behavior:

- **`loaders`** turn a file path into a raw value. For each string source, the first loader whose `match(id)` returns `true` wins; if none match, the built-in `.md`/JSON handling applies. Inline object sources bypass loaders. Register a source path with `ctx.addDependency(id)` (before reading it) so integrations reload on change. A loader's `ctx.readFile` is the same host capability the plugin was constructed with, so loaders only read files under the `/node` entry (or a custom runtime).
- **`normalizers`** run as an ordered chain over each loaded raw value — after the built-in DTCG normalizer, before the flatten stage — each receiving the previous one's output and returning a `DesignTokenGroup`. With no normalizers configured, raw values pass through unchanged.

```ts
import { parse as parseYaml } from 'yaml'

designTokens: {
	loaders: [
		{
			name: 'yaml',
			match: id => id.endsWith('.yaml') || id.endsWith('.yml'),
			load: async (id, ctx) => {
				ctx.addDependency(id)
				return parseYaml(await ctx.readFile(id))
			},
		},
	],
}
```

### Adapting a vendor format with a normalizer

A loader only decides how to read a source; when a design tool exports a shape that is not W3C Design Tokens — a flat list instead of a nested tree, say — a normalizer converts it to a canonical `DesignTokenGroup`. This is how you adapt a vendor dialect without pre-transforming the file by hand. The built-in DTCG normalizer runs first but passes shapes it does not recognize through untouched, so your normalizer still receives the raw vendor data; conversion happens before the flatten stage, so no "invalid token node" warnings are emitted.

```ts
import type { DesignTokenGroup } from '@pikacss/plugin-design-tokens'

// The vendor exports a flat list rather than a nested DTCG tree:
//   { "tokens": [{ "path": "color.brand", "value": "#3b82f6", "type": "color" }, …] }
interface VendorToken { path: string, value: string, type: string }

designTokens: {
	normalizers: [
		{
			name: 'vendor-flat-list',
			normalize: (raw) => {
				const group: DesignTokenGroup = {}
				const { tokens = [] } = raw as { tokens?: VendorToken[] }
				for (const { path, value, type } of tokens) {
					const segments = path.split('.')
					// Walk/create the nested group for every path segment but the last.
					let node = group as Record<string, any>
					for (const segment of segments.slice(0, -1))
						node = (node[segment] ??= {})
					node[segments[segments.length - 1]!] = { $value: value, $type: type }
				}
				return group
			},
		},
	],
}
```

Package a loader/normalizer pair like this as its own module to reuse a vendor adapter across projects; the seam is designed so adapters can live outside the core plugin.

## Usage Report

The engine exposes a design-token surface at `engine.designTokens` when the plugin is registered. `engine.designTokens.report()` returns a `DesignTokensReport` — total registered tokens, used/unused variable names, deprecated tokens in use, and cumulative strict-violation counts computed from the current atomic-style store. Strict-mode diagnostics are delivered live through the engine's `onDiagnostic` handler, so there is no queue to drain.

### Diagnostics and reports

The bundler integration presents strict-mode diagnostics through the engine diagnostic channel. Production usage reporting is controlled by the canonical PikaCSS project entry's `report` setting, not by an unplugin adapter option.

- **Diagnostics** — strict-mode violations are logged live; `error`-level diagnostics are aggregated at the production build diagnostic gate and fail the build.
- **`report`** — set it to `true` on a project entry to emit a usage summary after a successful production build; use `{ output }` to additionally publish the full JSON report. Dev/watch lifecycles do not emit final reports.

```ts
// pika.config.ts
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  report: { output: './design-tokens.report.json' },
  // engine: { plugins: [designTokens(...)] },
})
```

See [Unplugin](/integrations/unplugin#diagnostics-and-reporting) for host lifecycle behavior.

## Config

| Property | Description |
|---|---|
| sources | Base token sources emitted under `:root` — inline token group objects, file paths, or `{ source, prefix?, layer? }` entries. Later sources override earlier ones when names collide. |
| themes | Theme overrides keyed by theme name. Each theme takes a `selector` (default `.<themeName>`), an optional `media` query, an optional `from` partition selector, and its own `sources`. |
| loaders | Custom source loaders, tried before the built-in `.md`/JSON handling. First matching loader wins. |
| normalizers | Ordered normalizer chain applied after the built-in DTCG normalizer and before flattening. |
| typeAutocomplete | Per-`$type` autocomplete override map, merged over the built-in map. A `false` value suppresses value-of suggestions for that `$type`. |
| strict | Strict-mode governance: `level`, per-key `overrides`, `allowedValues`, `semanticOnly`, and compile-time `types`. Default: off. |
| prefix | Prefix prepended to every generated CSS variable name (without leading `--`). Default: `''`. |
| root | Base directory used to resolve relative source file paths. Absolute paths are authoritative; a relative value resolves from the engine host's project root. Default: the host project root, falling back to `process.cwd()` under the `/node` entry (`'.'` when no runtime capability is provided). |
| pruneUnused | Pruning override applied to every generated variable. When unset, the `variables` config default applies (unused tokens are pruned). |

> See [API Reference — Plugin Design Tokens](/api/plugin-design-tokens) for full type signatures and defaults.

## Next

- [Fonts](/official-plugins/fonts) — web font loading and management.
- [Variables](/customizations/variables) — the core variables system that design tokens feed into.
- [Unplugin](/integrations/unplugin) — the `report` option and the diagnostic channel that surfaces strict-mode violations.
