# Plugin: Design Tokens

> Read this when the user asks about W3C design token JSON, `design.md` token blocks, inline tokens, themes, aliases, CSS variable generation, token pruning, file watching, or neutral versus Node.js runtime adapters.

## Installation

```bash
pnpm add -D @pikacss/plugin-design-tokens
```

## Choose the Correct Entry

| Import | Capabilities |
|---|---|
| `@pikacss/plugin-design-tokens` | Inline token objects; file sources only when custom runtime capabilities are passed |
| `@pikacss/plugin-design-tokens/node` | Inline tokens plus JSON and Markdown file sources resolved with Node.js filesystem APIs |

Use `/node` in ordinary bundler config when `sources` contains paths:

```ts
// pika.config.ts
import { defineConfig } from '@pikacss/unplugin-pikacss'
import { designTokens } from '@pikacss/plugin-design-tokens/node'

export default defineConfig({
  engine: {
  plugins: [designTokens()],
  designTokens: {
    sources: ['./design.tokens.json'],
  },
  },
})
```

Using a string source with the neutral entry produces a diagnostic and skips that source unless a custom `readFile` capability was supplied.

## Inline Tokens

The neutral entry works with inline W3C-style token groups:

```ts
import { designTokens } from '@pikacss/plugin-design-tokens'

export default defineConfig({
  engine: {
  plugins: [designTokens()],
  designTokens: {
    sources: {
      color: {
        primary: { $value: '#3b82f6', $type: 'color' },
        accent: { $value: '{color.primary}' },
      },
    },
  },
  },
})
```

This generates variables such as `--color-primary` and `--color-accent` through the core variables system.

## File Sources

With the Node adapter:

- Paths ending in `.md` are parsed as design documents.
- Other paths are parsed as W3C design token JSON.
- Relative paths resolve against `designTokens.root`, then the runtime working directory.
- Missing paths are still registered as config dependencies so creating the file later can trigger a reload.
- Invalid or unreadable sources emit structured diagnostics and are skipped rather than partially crashing token resolution.

```ts
export default defineConfig({
  engine: {
  plugins: [designTokens()],
  designTokens: {
    root: './design',
    sources: ['tokens.json', 'components.md'],
  },
  },
})
```

## Markdown Token Blocks

Only fenced blocks whose info string starts with `tokens` are parsed:

````md
# Buttons

```tokens
{
  "color": {
    "primary": { "$value": "#3b82f6" }
  }
}
```

```tokens theme=dark selector="[data-theme='dark']"
{
  "color": {
    "primary": { "$value": "#60a5fa" }
  }
}
```
````

Supported fence attributes:

- `theme=<name>` assigns a block to a theme.
- `selector=<css-selector>` overrides that theme block's selector.

Malformed JSON blocks are skipped with diagnostics.

## Themes

Base variables are emitted under `:root`. Theme variables use:

1. A selector specified on the Markdown token block.
2. `themes.<name>.selector` from config.
3. The default `.<themeName>` selector.

```ts
export default defineConfig({
  engine: {
  plugins: [designTokens()],
  designTokens: {
    sources: ['./tokens.json'],
    themes: {
      dark: {
        selector: '[data-theme="dark"]',
        sources: ['./tokens.dark.json'],
      },
    },
  },
  },
})
```

Later sources override earlier sources when generated variable names collide.

## Config Reference

| Option | Purpose | Default |
|---|---|---|
| `sources` | Inline token groups or file paths for `:root` | — |
| `themes` | Theme selectors and token sources keyed by theme name | — |
| `prefix` | Prefix inserted into generated variable names, without `--` | `''` |
| `root` | Base path for relative file sources | Runtime cwd; `'.'` without one |
| `pruneUnused` | Per-token override for variable pruning | Inherits the variables config default |

## Names and Aliases

Each path segment is normalized to kebab-case and joined with `-`:

- `color.primary` → `--color-primary`
- `fontSize.body` → `--font-size-body`
- With `prefix: 'app'`: `color.primary` → `--app-color-primary`

String token values may reference another token:

```json
{
  "color": {
    "primary": { "$value": "#3b82f6" },
    "border": { "$value": "1px solid {color.primary}" }
  }
}
```

The alias becomes `var(--color-primary)` using the same normalization and prefix.

## Composite Values

Dedicated serializers exist for:

- `shadow`
- `border`
- `transition`
- Arrays, whose serialized items are joined with `, `

An object value without a dedicated serializer is expanded into sub-variables. For example, a typography object with `fontSize` creates a `...-font-size` variable.

## Pruning and Usage

Tokens are inserted into `variables.definitions`, so they inherit:

- Variable scoping.
- Generated autocomplete.
- Unused-variable pruning.

Reference a token from normal styles:

```ts
pika({
  color: 'var(--color-primary)',
  borderColor: 'var(--color-border)',
})
```

Set `designTokens.pruneUnused: false` when all generated token variables must remain even when PikaCSS cannot observe a reference.

## Strict Mode (value governance)

Opt in via `designTokens.strict`. Defaults to off — a near-zero-cost early return in the transform hook. A CSS property is **governed** when it appears in the merged `typeAutocomplete` map for a `$type` that has at least one registered token. Authored values on governed properties are validated against the governing `$type`; violations become **diagnostics** (never thrown by the engine).

```ts
designTokens: {
  strict: {
    level: 'error',                                        // baseline for every governed property
    overrides: { 'background-color': 'warn', dimension: 'off' },
    allowedValues: ['0', /^var\(--legacy-/],               // extra accepted literals
    semanticOnly: true,                                    // forbid primitive-layer tokens in styles
    types: true,                                           // narrow pika.gen.ts value types
  },
}
```

- **`level`** (`'off' | 'warn' | 'error'`, default `'off'`) — baseline severity. `warn` → `'warning'` diagnostic; `error` → `'error'` diagnostic.
- **`overrides`** — per-key severity. Key is a CSS property (`'background-color'`) or a `$type` (`'color'`). Precedence: **property-key > `$type`-key > `level`**.
- **`allowedValues`** — extra literals accepted on any governed property, on top of the built-in per-`$type` allowlist. String = exact match on the trimmed value; `RegExp` = tested against the trimmed value.
- **`semanticOnly`** — when `true` (and `level` ≠ `'off'`), using a `primitive`-layer token in an authored style is a violation; primitive-layer tokens are also hidden from autocomplete at emit time. Requires sources tagged with `layer` (use the `{ source, layer }` entry form).
- **`types`** — when `true`, narrows the accepted TS value type of every governed property in the generated `pika.gen.ts` to an exclusive union (invalid literals red-squiggle in the IDE before any build). The union admits: a `var(--token)` reference (plus a `var(--token, fallback)` form) per token of the governing `$type`, CSS-wide keywords, the built-in per-`$type` allowlist + string `allowedValues`, and template-literal escape hatches (`calc()`, `color-mix()`, `min()`, `max()`, `clamp()`, `light-dark()`). Independent of `level` (compile-time surface vs build-time diagnostics). **If any `RegExp` `allowedValues` entry is present, type narrowing is disabled entirely** (a RegExp can't be a faithful literal union). When `false`/absent, generated types are byte-identical to a no-strict-types project.

### How strict violations surface (unplugin / nuxt)

A violation is reported as a core `Diagnostic` (`{ level, code, message, plugin: 'design-tokens' }`) through the engine's `onDiagnostic` handler while styles are transformed — it is never thrown. The bundler integration wires that handler itself; there is **no `onDiagnostic` plugin option** to set.

- Every diagnostic is logged live, so a `'warning'` surfaces immediately (including in dev).
- `'error'`-level diagnostics are collected and re-thrown as one aggregated `Error` at `buildEnd`, so an error-severity violation **fails a production build**. (Trade-off: the error surfaces after the full build, not inline on the producing module.)
- Do **not** throw from a custom diagnostic handler: core `emitDiagnostic` swallows handler throws, so throwing cannot fail the build. Customization of the handler is only possible through the integration's `createCtx({ onDiagnostic })` seam, not through the unplugin.

## Custom Loaders and Normalizers

For source formats beyond `.md`/JSON (e.g. YAML) or a vendor dialect, add `loaders` (turn a file id into a raw value) and/or `normalizers` (convert a raw value into a `DesignTokenGroup`).

- **Loaders** are tried before built-in handling. For each string source, the first loader whose `match(id)` returns `true` wins; if none match, built-in `.md`/JSON handling applies. Inline object sources bypass loaders. Register the path with `ctx.addDependency(id)` (before reading, so a missing file is still watched). `ctx.readFile` is the host capability the plugin was constructed with, so loaders read files only under the `/node` entry (or a custom runtime).
- **Normalizers** run as an ordered chain over each loaded raw source before flattening — after the built-in DTCG normalizer — each receiving the previous one's output. With none configured, raw values pass through unchanged.

```ts
import { parse as parseYaml } from 'yaml'

designTokens: {
  loaders: [{
    name: 'yaml',
    match: id => id.endsWith('.yaml') || id.endsWith('.yml'),
    load: async (id, ctx) => { ctx.addDependency(id); return parseYaml(await ctx.readFile(id)) },
  }],
}
```

Use a normalizer when a design tool exports a shape that is not W3C Design Tokens (a flat list rather than a nested tree). The built-in DTCG normalizer passes shapes it does not recognize through untouched, so a custom normalizer still receives the raw vendor data, and conversion happens before flattening (no "invalid token node" warnings):

```ts
import type { DesignTokenGroup } from '@pikacss/plugin-design-tokens'

// Vendor exports: { "tokens": [{ "path": "color.brand", "value": "#3b82f6", "type": "color" }, …] }
interface VendorToken { path: string, value: string, type: string }

designTokens: {
  normalizers: [{
    name: 'vendor-flat-list',
    normalize: (raw) => {
      const group: DesignTokenGroup = {}
      const { tokens = [] } = raw as { tokens?: VendorToken[] }
      for (const { path, value, type } of tokens) {
        const segments = path.split('.')
        let node = group as Record<string, any>
        for (const segment of segments.slice(0, -1))
          node = (node[segment] ??= {})
        node[segments[segments.length - 1]!] = { $value: value, $type: type }
      }
      return group
    },
  }],
}
```

`LoaderCtx`: `readFile`, `projectRoot` (the engine host's effective project root, #118), `root` (the effective design-token root: absolute `config.root`, or a relative one resolved from `projectRoot`, or `projectRoot` itself), `cwd` (legacy runtime working directory — not project identity), `addDependency`. `NormalizeCtx`: `id` (resolved path, or `'inline'`), `root`, `sourceIds` (all ids this pass, base first then theme, for cross-source refs). Package a loader/normalizer pair as its own module to reuse a vendor adapter across projects.

## Usage Report

When registered, the Design Tokens plugin preserves one real Engine-generation capability: `engine.designTokens.report()`. It returns the domain report (`totalTokens`, `used[]`, `unused[]`, `deprecatedInUse[]`, and strict-violation counts). Strict TypeScript narrowing is contributed directly to Core Typegen property constraints during initialization; there is no `engine.designTokens.strictTypes()` side channel.

Production report execution is configured on the canonical **project entry**, not in bundler/Nuxt adapter options:

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'
import { designTokens } from '@pikacss/plugin-design-tokens/node'

export default defineConfig({
  report: true,
  engine: {
    plugins: [designTokens()],
    designTokens: {
      sources: ['./tokens.json'],
    },
  },
})
```

Use `{ output: './design-tokens-report.json' }` to additionally write JSON. The path is a config-authored filesystem value and resolves from the selected config file's directory. Report finalization runs only after a successful production build; dev and `pikacss prepare` do not run it.

Multi-entry projects configure `report` independently per entry. Nuxt does not duplicate report semantics in module options; it consumes the same canonical project config.

## Runtime Capabilities for Custom Hosts

The neutral factory accepts optional runtime capabilities:

```ts
import { designTokens } from '@pikacss/plugin-design-tokens'

const plugin = designTokens({
  readFile: async absolutePath => customFilesystem.readText(absolutePath),
  cwd: () => '/project',
})
```

Use this only for non-Node hosts or custom integrations. Application bundler config should normally use the `/node` entry instead.

## Diagnostics and File Watching

The plugin reports structured diagnostics through the current engine's diagnostic handler. File-backed sources register every resolved path with `engine.addConfigDependency`, including missing paths, so official integrations can recreate the engine after changes.

When testing failures, pass `onDiagnostic` to `createEngine` and assert diagnostic codes such as file-loader unavailable, read failure, invalid JSON, or unsupported value. Do not rely on console spying.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| File source is skipped | Neutral entry used | Import from `@pikacss/plugin-design-tokens/node` |
| Relative path resolves incorrectly | Wrong root or integration cwd | Set `designTokens.root` explicitly |
| Theme variables use the wrong selector | Fence selector/config selector mismatch | Align the selector with the application's actual theme mechanism |
| Token variable is missing from output | Unused-variable pruning | Reference the variable or set `pruneUnused: false` |
| Alias points to an unexpected name | Prefix/path normalization misunderstood | Apply the same prefix and kebab-case path rules to the target |
| Editing a source does not reload | Custom host does not watch config dependencies | Ensure the integration watches `engine.configDependencies` |
