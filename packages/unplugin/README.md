# @pikacss/unplugin-pikacss

PikaCSS bundler integration for the Rollup and Webpack families. Officially supported hosts are Vite, Rollup, Rolldown, Webpack, and Rspack.

PikaCSS requires Node.js `>=22.19.0` (package engine range: `>=22.19.0`). The Vite entry supports Vite 7 and 8 only.

## Installation

```bash
pnpm add -D @pikacss/unplugin-pikacss
```

When using the `@pikacss/unplugin-pikacss/vite` entry, install Vite 7 or 8.

## Usage

### Vite

```ts
// vite.config.ts
import pikacss from '@pikacss/unplugin-pikacss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [pikacss()],
})
```

### Supported bundlers

Use the explicit entry point matching your bundler:

| Family | Bundler | Entry point |
|---|---|---|
| Rollup | Vite | `@pikacss/unplugin-pikacss/vite` |
| Rollup | Rollup | `@pikacss/unplugin-pikacss/rollup` |
| Rollup | Rolldown | `@pikacss/unplugin-pikacss/rolldown` |
| Webpack | Webpack | `@pikacss/unplugin-pikacss/webpack` |
| Webpack | Rspack | `@pikacss/unplugin-pikacss/rspack` |

Other Unplugin hosts, including esbuild, are not supported. No public adapter entry point is shipped for unsupported hosts. The package root exposes shared types and factory primitives; use one of the supported bundler subpaths above for an executable plugin.

For example:

```ts
// rollup.config.ts
import pikacss from '@pikacss/unplugin-pikacss/rollup'

export default {
  plugins: [pikacss()],
}
```

See the integration guide for bundler-specific configuration details.

## CLI

Installing this package also provides the `pikacss` binary:

```bash
pikacss init --cwd .
pikacss prepare --cwd .
pikacss prepare --cwd . --config ./config/pika.config.ts
```

`init` conservatively creates a canonical config only when one does not already exist. `prepare` publishes PikaCSS generated authoring state only; it does not scan application sources, build runtime CSS, or emit production reports.

## Documentation

See the [full documentation](https://pikacss.github.io/integrations/unplugin).

## License

MIT
