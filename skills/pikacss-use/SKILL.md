---
name: pikacss-use
description: 'Use when working with PikaCSS, the build-time atomic CSS-in-JS engine. Covers consumer setup, Vite/Nuxt/Webpack/Rollup/esbuild/Rspack/Rolldown integration, pika.config, pika(), generated CSS and TypeScript declarations, selectors, shortcuts, variables, keyframes, preflights, official plugins (reset, icons, fonts, typography, design tokens), ESLint, troubleshooting, and plugin authoring with defineEnginePlugin, lifecycle hooks, diagnostics, runtime adapters, EngineConfig augmentation, engine APIs, and createEngine tests. Trigger on PikaCSS, pika(), defineEnginePlugin, plugin hooks, or PikaCSS configuration.'
---

# Use PikaCSS

PikaCSS is an instant on-demand atomic CSS-in-JS engine. It transforms statically analyzable `pika()` calls into class-name literals at build time, emits the matching atomic CSS, and generates TypeScript declarations for the compile-time globals.

- **Docs**: <https://pikacss.github.io/getting-started/>
- **API Reference**: <https://pikacss.github.io/api/>
- **Source**: <https://github.com/pikacss/pikacss>

## Reference Files

Load the smallest relevant reference instead of guessing from memory:

| File | When to read |
|---|---|
| `references/build-options.md` | Build plugin options, scan patterns, codegen paths, custom function names, bundler roots, or HMR |
| `references/customizations.md` | Variables, theming, keyframes, preflights, selectors, shortcuts, `__shortcut`, `__layer`, `__important`, CSS value fallbacks, or typed config fragments |
| `references/plugin-reset.md` | Choosing and configuring a reset style |
| `references/plugin-icons.md` | Icon shortcuts, Iconify collections, Node versus neutral adapters, processor metadata, or icon troubleshooting |
| `references/plugin-fonts.md` | Google Fonts, `@font-face`, `@import`, font families, or providers |
| `references/plugin-typography.md` | Prose shortcuts and `--pk-prose-*` variables |
| `references/plugin-design-tokens.md` | Inline or file-backed design tokens, W3C token JSON, `design.md`, themes, aliases, pruning, or runtime adapters |
| `references/plugin-development.md` | Creating plugins, lifecycle hooks, diagnostics, engine APIs, config augmentation, external file dependencies, or testing |

## Non-Negotiable Facts

- Node-targeted PikaCSS packages declare `engines.node` as `>=22`. The platform-neutral packages (`@pikacss/core`, `@pikacss/plugin-icons`, `@pikacss/plugin-design-tokens`) declare none on purpose.
- The Vite adapter supports **Vite 7 and 8** (`^7.0.0 || ^8.0.0`).
- `pika` is a generated compile-time global. **Never import it.**
- Arguments must be statically analyzable. Runtime values belong in CSS variables, variant maps, or predefined shortcuts.
- The built-in AST processors support the JS family (`js`, `mjs`, `cjs`, `jsx`, `ts`, `mts`, `cts`, `tsx`) and Vue SFCs. Do not claim Svelte, Astro, or plain HTML source transforms are supported.
- Config discovery is project-root-only. Generated declaration files must be included in the TypeScript program.

## How the Compile-Time Macro Works

```ts
const className = pika({ display: 'flex', color: 'red' })
```

is transformed into a plain literal such as:

```ts
const className = 'pk-a1b2 pk-c3d4'
```

The generated CSS contains the corresponding atomic rules. No PikaCSS runtime is shipped to the browser.

## Installation

### Vite and other unplugin integrations

```bash
pnpm add -D @pikacss/core @pikacss/unplugin-pikacss
```

### Nuxt

```bash
pnpm add -D @pikacss/core @pikacss/nuxt-pikacss
```

### Optional packages

```bash
pnpm add -D @pikacss/plugin-reset
pnpm add -D @pikacss/plugin-icons
pnpm add -D @pikacss/plugin-fonts
pnpm add -D @pikacss/plugin-typography
pnpm add -D @pikacss/plugin-design-tokens
pnpm add -D @pikacss/eslint-config
```

Install `@pikacss/core` directly because application config files and official plugins consume its public types and helpers.

## Build Plugin Setup

### Vite

```ts
// vite.config.ts
import pikacss from '@pikacss/unplugin-pikacss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [pikacss()],
})
```

The Vite adapter uses `enforce: 'pre'`, so `[vue(), pikacss()]` is supported even though listing PikaCSS first remains clearer.

### Other bundlers

| Bundler | Import path |
|---|---|
| Vite | `@pikacss/unplugin-pikacss/vite` |
| Rollup | `@pikacss/unplugin-pikacss/rollup` |
| Webpack | `@pikacss/unplugin-pikacss/webpack` |
| esbuild | `@pikacss/unplugin-pikacss/esbuild` |
| Rspack | `@pikacss/unplugin-pikacss/rspack` |
| Rolldown | `@pikacss/unplugin-pikacss/rolldown` |

Each subpath exports a plugin factory. Add `pikacss()` to the target bundler's plugin array. Read `references/build-options.md` before recommending non-default options.

### Nuxt

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@pikacss/nuxt-pikacss'],
})
```

Do not also add `@pikacss/unplugin-pikacss/vite`. The Nuxt module owns the Vite wiring and imports `pika.css` through a generated Nuxt plugin/template.

## Generated Files and CSS Import

The build integration writes:

- Runtime CSS as internal state under `.pikacss/` in the project root. Each dev/build run owns its own file; the location is not configurable.
- `pika.gen.ts` by default. TypeScript codegen may be redirected or disabled.
- `pika.config.js` only when `autoCreateConfig: true`; the default is `false`.

For non-Nuxt applications, import the virtual CSS module in the entry file:

```ts
import 'pika.css'
```

The virtual module resolves to the current run's internal runtime CSS automatically.

### TypeScript inclusion

A root-level `pika.gen.ts` is not included by scaffolded projects whose tsconfig only includes `src`. Prefer either:

```ts
// vite.config.ts
pikacss({ tsCodegen: './src/pika.gen.ts' })
```

or:

```jsonc
{
  "include": ["src", "pika.gen.ts"]
}
```

A standalone `tsc --noEmit` run also needs the generated file to exist. Run a build/codegen step first or commit `pika.gen.ts` when CI typechecks before building.

## Engine Configuration

Supported root config names, in discovery priority order:

- `pika.config.{ts,mts,cts,js,mjs,cjs}`
- `pikacss.config.{ts,mts,cts,js,mjs,cjs}`

Use at most one config file. A config file is optional when the default engine behavior is sufficient.

```ts
// pika.config.ts
import { defineEngineConfig } from '@pikacss/core'
import { icons } from '@pikacss/plugin-icons/node'
import { reset } from '@pikacss/plugin-reset'

export default defineEngineConfig({
  prefix: 'pk-',
  plugins: [reset(), icons()],
})
```

The Node icons adapter is the normal choice in bundler config when locally installed `@iconify-json/*` packages or `autoInstall` are required. The neutral `@pikacss/plugin-icons` entry only handles custom collections and CDN loading unless custom runtime capabilities are supplied.

### Core config options

| Option | Type | Default | Purpose |
|---|---|---|---|
| `plugins` | `EnginePlugin[]` | `[]` | Engine plugins |
| `prefix` | `string` | `'pk-'` | Atomic class prefix |
| `defaultSelector` | `string` | `'.%'` | Atomic selector template; `%` is the generated class placeholder |
| `preflights` | `Preflight[]` | `[]` | Global CSS emitted before utilities |
| `cssImports` | `string[]` | `[]` | CSS `@import` statements prepended to output |
| `layers` | `Record<string, number>` | `{ preflights: 1, utilities: 10 }` | CSS layer ordering |
| `defaultPreflightsLayer` | `string` | `'preflights'` | Default preflight layer |
| `defaultUtilitiesLayer` | `string` | `'utilities'` | Default atomic utility layer |
| `autocomplete` | `AutocompleteConfig` | `{}` | Generated IDE/type autocomplete configuration |

### Plugin-augmented config keys

Core internal plugins add `important`, `selectors`, `shortcuts`, `variables`, and `keyframes`. Official packages additionally augment keys such as `reset`, `icons`, `fonts`, and `designTokens` when their modules are imported.

Read `references/customizations.md` for exact shapes. Do not invent removed `define*` wrapper helpers for reusable config fragments.

## Usage

### Style items

`pika()` accepts one or more style items:

- A style definition object.
- A registered shortcut name.
- An unresolved string, which is preserved as an existing/raw class name.

```ts
const classes = pika(
  'existing-class',
  'flex-center',
  {
    display: 'flex',
    alignItems: 'center',
    fontSize: '1rem',
  },
)
```

Both camelCase and kebab-case CSS properties are accepted.

### CSS value fallbacks

Use `[primaryValue, fallbackValues[]]`. Fallback declarations are emitted first, then the primary value:

```ts
pika({
  color: ['oklch(0.7 0.15 220)', ['rgb(0 120 255)', 'blue']],
})
```

Do not use a flat array such as `['red', 'blue']`; that is not the fallback tuple shape.

### Function variants

| Syntax | Output | Purpose |
|---|---|---|
| `pika(...)` | Configured default | Uses `transformedFormat` |
| `pika.str(...)` | `string` | Forces a space-separated class string |
| `pika.arr(...)` | `string[]` | Forces an array of class names |
### Nested selectors

Built-in pseudo selectors use a `$` prefix; CSS at-rules are written directly. Named aliases must be registered under `selectors.definitions`.

```ts
pika({
  color: 'red',
  '$:hover': { opacity: '0.8' },
  '$::before': { content: '""' },
  '@media (min-width: 768px)': { fontSize: '1.2rem' },
  '@dark': { color: 'white' }, // custom alias; register it first
})
```

```ts
selectors: {
  definitions: [
    ['@dark', 'html.dark $'],
  ],
}
```

Inside a selector definition, `$` is replaced by the generated atomic class selector.

### Per-definition controls

```ts
pika({
  __shortcut: ['flex-center', 'card'],
  __layer: 'components',
  __important: true,
  gap: '1rem',
})
```

- `__shortcut` expands shortcuts before the object's own declarations, so explicit declarations win.
- `__layer` selects a configured layer.
- `__important` applies `!important`, including to expanded shortcut declarations.

## Official Plugins

| Plugin | Package | Important adapter rule | Reference |
|---|---|---|---|
| Reset | `@pikacss/plugin-reset` | No runtime split | `references/plugin-reset.md` |
| Icons | `@pikacss/plugin-icons` | Use `/node` for local Iconify packages and `autoInstall`; neutral entry supports custom/CDN sources | `references/plugin-icons.md` |
| Fonts | `@pikacss/plugin-fonts` | No runtime split | `references/plugin-fonts.md` |
| Typography | `@pikacss/plugin-typography` | No runtime split | `references/plugin-typography.md` |
| Design Tokens | `@pikacss/plugin-design-tokens` | Use `/node` for JSON/Markdown file paths; neutral entry supports inline tokens | `references/plugin-design-tokens.md` |

Each plugin factory belongs in `plugins`. Its module import also activates the corresponding `EngineConfig` augmentation.

## Public Define Helpers

`@pikacss/core` exposes two public define helpers:

- `defineEngineConfig(config)`
- `defineEnginePlugin(plugin)`

For reusable styles, preflights, selectors, shortcuts, variables, or keyframes, use plain object literals with `satisfies` or explicit type annotations.

## ESLint

```ts
// eslint.config.mjs
import pikacss from '@pikacss/eslint-config'

export default [pikacss()]
```

The default export returns a flat-config entry. Keep its `fnName` aligned with the build plugin when using a custom compile-time function name.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Config not detected | Wrong name, duplicate configs, or wrong directory | Keep one supported config file at the project root |
| Styles not applied | Missing virtual CSS import | Add `import 'pika.css'` outside Nuxt |
| `Cannot find name 'pika'` | Generated declarations absent from the TS program | Generate `pika.gen.ts` and include it, or write it under `src` |
| `pika is not defined` survives into output | Build adapter is missing, disabled, or not scanning the file | Verify the correct bundler adapter and supported extension; update old integrations |
| Vue transform ordering issue | Old Vite integration | Current Vite adapter uses `enforce: 'pre'`; update before changing plugin order |
| Dynamic argument build error | Argument cannot be statically evaluated | Replace runtime values with CSS variables, variant maps, or shortcuts |
| Local icon collection is ignored | Neutral icons entry used | Import `icons` from `@pikacss/plugin-icons/node` |
| Design-token file source is ignored | Neutral design-tokens entry used | Import `designTokens` from `@pikacss/plugin-design-tokens/node` |
| Plugin config types missing | Augmenting package was never imported | Import and call the plugin factory in `pika.config.*` |
| Plugin hook not firing | Factory not called or wrong hook name | Use `plugins: [myPlugin()]` and exact lifecycle hook names |
| External plugin data does not trigger reload | Dependency path not registered | Call `engine.addConfigDependency(path)` in `configureEngine` |

## Plugin Development Quick Start

Read `references/plugin-development.md` before implementing a plugin. Current essentials:

- Hooks are direct methods on `defineEnginePlugin({ ... })`; there is no `setup()` wrapper.
- Order is `'pre'` → default → `'post'`.
- Every hook receives an optional `EnginePluginContext`; use `context.onDiagnostic` for structured warnings/errors.
- Use `configureRawConfig` for defaults and raw config composition.
- Use `configureEngine` for runtime registration, diagnostics through `engine.reportDiagnostic`, and external file dependencies through `engine.addConfigDependency`.
- Extend `EngineConfig` with TypeScript module augmentation.
- Test with `createEngine(config, { onDiagnostic })` and assert diagnostics as data rather than spying on `console`.

## Workflow

### Consumer setup

1. Confirm Node.js and bundler versions.
2. Install `@pikacss/core` plus the correct integration package.
3. Register the bundler plugin or Nuxt module.
4. Add at most one root config file when customization is needed; zero-config defaults are supported.
5. Import `pika.css` outside Nuxt.
6. Ensure `pika.gen.ts` exists and is included by TypeScript.
7. Use only supported source extensions and statically analyzable arguments.
8. Load the relevant customization or official-plugin reference before proposing advanced config.

### Plugin authoring

1. Define the user-facing behavior and config augmentation.
2. Choose the smallest lifecycle hooks that implement it.
3. Keep platform-specific capabilities behind explicit adapters, such as `/node` entries.
4. Emit structured diagnostics instead of assuming a console.
5. Register every external file through `engine.addConfigDependency`.
6. Add `createEngine` tests for normal behavior, diagnostics, and hook ordering.
