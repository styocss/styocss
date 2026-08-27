---
name: pikacss-use
description: 'Use when working with PikaCSS, the build-time atomic CSS-in-JS engine. Covers consumer setup, supported Vite/Rollup/Rolldown/Webpack/Rspack and Nuxt integration, canonical pika.config, pika(), generated state, selectors, shortcuts, variables, keyframes, preflights, official plugins, ESLint, troubleshooting, and plugin authoring with defineEnginePlugin, Typegen/Pika capabilities, diagnostics, EngineConfig augmentation, and createEngine tests. Trigger on PikaCSS, pika(), defineEnginePlugin, plugin hooks, or PikaCSS configuration.'
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
| `references/build-options.md` | Supported hosts, adapter bootstrap options, canonical project config, scan/output settings, generated state, prepare/init, reports, or HMR |
| `references/customizations.md` | Variables, theming, keyframes, preflights, selectors, shortcuts, shortcut array composition, `__layer`, `__important`, CSS value fallbacks, or typed config fragments |
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
- Canonical auto-discovery checks only `pika.config.{ts,mts,js,mjs}` in the project root; zero files is valid, multiple files are an error. Generated `<stateDir>/pika.gen.ts` must be included in generic TypeScript projects.

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
pnpm add -D @pikacss/unplugin-pikacss
```

### Nuxt

```bash
pnpm add -D @pikacss/nuxt-pikacss
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

Normal consumers should import `defineConfig` and authoring types from the directly installed outer package. Install `@pikacss/core` directly only for low-level Engine/plugin development.

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

| Family | Bundler | Import path |
|---|---|---|
| Rollup | Vite | `@pikacss/unplugin-pikacss/vite` |
| Rollup | Rollup | `@pikacss/unplugin-pikacss/rollup` |
| Rollup | Rolldown | `@pikacss/unplugin-pikacss/rolldown` |
| Webpack | Webpack | `@pikacss/unplugin-pikacss/webpack` |
| Webpack | Rspack | `@pikacss/unplugin-pikacss/rspack` |

Other Unplugin hosts, including esbuild, are unsupported and have no public PikaCSS adapter entry point.

Each subpath exports a plugin factory. Add `pikacss()` to the target bundler's plugin array. Read `references/build-options.md` before recommending non-default options.

### Nuxt

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@pikacss/nuxt-pikacss'],
})
```

Do not also add `@pikacss/unplugin-pikacss/vite`. The Nuxt module owns the Vite wiring and imports `pika.css` through a generated Nuxt plugin/template.

## Generated State and CSS Import

The default whole-project state root is `.pikacss/`:

- `.pikacss/pika.gen.ts` is always generated authoring TypeScript.
- `.pikacss/previews/` holds host-bound rich-hover assets where needed.
- `.pikacss/runs/<runId>/...` holds invocation-owned runtime CSS.

There is no per-Typegen enable/path option. Configure `stateDir` in `defineConfig()` only when the entire generated-state root must move.

For non-Nuxt applications, import the configured logical CSS module:

```ts
import 'pika.css'
```

Generic TypeScript projects must include/reference `.pikacss/pika.gen.ts`. Before standalone typecheck/ESLint/editor workflows, run:

```sh
pikacss prepare
```

Use `pikacss init` to conservatively scaffold a canonical config when desired.

## Project and Engine Configuration

Project config is authored with `defineConfig()` from the directly installed outer package. Auto-discovery recognizes exactly `pika.config.{ts,mts,js,mjs}`; zero candidates is valid and multiple candidates are an error.

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'
import { icons } from '@pikacss/plugin-icons/node'
import { reset } from '@pikacss/plugin-reset'

export default defineConfig({
  fnName: 'pika',
  cssModule: 'pika.css',
  transformedFormat: 'string',
  engine: {
    prefix: 'pk-',
    plugins: [reset(), icons()],
  },
})
```

Project-level fields include `fnName`, `cssModule`, `transformedFormat`, `scan`, `report`, and `stateDir`; Engine-specific semantics remain under `engine`.

### CSS value fallbacks

Use `[primaryValue, fallbackValues[]]`. Fallback declarations are emitted first, then the primary value:

```ts
pika({
  color: ['oklch(0.7 0.15 220)', ['rgb(0 120 255)', 'blue']],
})
```

Do not use a flat array such as `['red', 'blue']`; that is not the fallback tuple shape.

### Output format

The configured base `pika(...)` call uses the owning entry's `transformedFormat` (`'string'` by default, or `'array'`). There are no per-call output-format variants.


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
    { name: '@dark', value: 'html.dark $' },
  ],
}
```

Inside a selector definition, `$` is replaced by the generated atomic class selector.

### Per-definition controls

```ts
pika('flex-center', 'card', {
  __layer: 'components',
  __important: true,
  gap: '1rem',
})
```

- Compose shortcuts as ordinary string `StyleItem`s or inside shortcut definition `value: StyleItem[]`.
- `__layer` selects a configured layer.
- `__important` applies `!important` to the definition.


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
