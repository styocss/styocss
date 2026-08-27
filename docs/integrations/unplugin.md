---
title: Unplugin
description: Configure PikaCSS with supported Rollup-family and Webpack-family bundlers.
relatedPackages:
  - '@pikacss/unplugin-pikacss'
relatedSources:
  - 'packages/unplugin/src/index.ts'
  - 'packages/unplugin/src/types.ts'
category: integrations
order: 10
---

# Unplugin

PikaCSS uses [unplugin](https://github.com/unjs/unplugin) as an adapter layer, but support is intentionally limited to the Rollup and Webpack families.

The Vite entry supports Vite 7 and 8 only.

## Supported Tools

| Family | Bundler | Import Path |
|--------|---------|-------------|
| Rollup | Vite | `@pikacss/unplugin-pikacss/vite` |
| Rollup | Rollup | `@pikacss/unplugin-pikacss/rollup` |
| Rollup | Rolldown | `@pikacss/unplugin-pikacss/rolldown` |
| Webpack | Webpack | `@pikacss/unplugin-pikacss/webpack` |
| Webpack | Rspack | `@pikacss/unplugin-pikacss/rspack` |

Other Unplugin hosts, including esbuild, are outside the supported surface and have no public PikaCSS adapter entry point. Import an explicit supported bundler subpath rather than the package root when configuring a bundler plugin.

Example with Vite:

```ts
// vite.config.ts
import PikaCSS from '@pikacss/unplugin-pikacss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    PikaCSS({
      // options
    }),
  ],
})
```

:::tip Vite plugin order
The Vite entry registers with `enforce: 'pre'`. PikaCSS still runs before framework compiler plugins even if your Vite `plugins` array is ordered as `[vue(), pikacss()]`, so you do not need to reorder the array just to avoid template compile errors.
:::

## Config

The bundler adapter has only two bootstrap selectors. Source scanning, function roots, CSS-module names, transform format, generated-state placement, Engine behavior, and production reports belong to the canonical PikaCSS project config.

| Property | Type | Description |
|---|---|---|
| `cwd` | `string?` | Optional project-root override. Normally the supported bundler supplies its resolved root/context. |
| `config` | `string?` | Optional explicit PikaCSS config file. Relative paths are resolved from the selected project root; when omitted, canonical project-root discovery is used. |

> See [API Reference — Unplugin](/api/unplugin) for exact type signatures.

## Diagnostics and Reporting

Engine plugins can report diagnostics during transforms (for example, [`@pikacss/plugin-design-tokens`](/official-plugins/design-tokens#strict-mode) strict mode). The engine never throws them — it hands each `Diagnostic` (`{ level, code, message, plugin?, … }`) to a handler. The unplugin installs that handler for you; there is no `onDiagnostic` plugin option to set.

### How diagnostics surface

The built-in handler logs **every** diagnostic live, so a `'warning'` appears immediately during dev and build. It also collects the `'error'`-level diagnostics and, once every module has been transformed, throws a single aggregated `Error` at `buildEnd` listing them all — so an error-severity diagnostic **fails a production build**.

::: info Why the build fails at `buildEnd`, not inline
Core delivers diagnostics through a handler whose throws are swallowed, so a handler cannot abort a single module's transform. Errors are therefore aggregated and thrown once at `buildEnd`. The trade-off: an error surfaces after the full build rather than inline on the producing module (with Vite's dev overlay). Warnings still log live on the module that produced them.
:::

### Production reports

Production reporting is configured per entry in the canonical PikaCSS project config, not as a bundler-plugin option. `report: true` enables the final summary for that entry; `{ output }` additionally publishes its JSON report to the config-relative path.

```ts
// pika.config.ts
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  report: { output: './design-tokens.report.json' },
})
```

The adapter only owns host lifecycle presentation. Reports finalize after a successful one-shot production build on supported Rollup-family and Webpack-family hosts; dev/watch lifecycles do not publish final reports. Report producer, serialization, directory, write, or atomic-replacement failures reject the production build.

## CLI

A direct install of `@pikacss/unplugin-pikacss` provides the `pikacss` binary. The CLI is intentionally narrow:

```bash
pikacss init [--cwd <dir>]
pikacss prepare [--cwd <dir>] [--config <file>]
```

`init` creates only a canonical PikaCSS config when none exists and prints setup guidance; it does not modify package metadata, TypeScript config, or ignore files. `prepare` performs deterministic generated-state publication only. It does not source-scan, build runtime CSS, start watchers, or emit final production reports.

`--cwd` selects the host project root. `--config` is available to `prepare` as the same explicit closed config-file selector used by the bundler adapter.

## TypeScript and logical CSS modules

In Vite projects, the ambient `*.css` module declaration from `vite/client` covers logical CSS-module specifiers such as the single-entry default `pika.css`. PikaCSS itself ships no ambient declaration for those specifiers, so TypeScript projects on other bundlers (Webpack, Rspack, Rollup, Rolldown) may report `TS2307` for the configured `cssModule`. Add a shim for each logical module your application imports:

```ts
// pika-css.d.ts
declare module 'pika.css' // or your configured logical cssModule
```

## Next

- [Nuxt](/integrations/nuxt) — zero-config Nuxt integration.
- [Setup](/getting-started/setup) — basic project setup.
