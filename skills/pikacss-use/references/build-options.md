# Build Integration and Project Configuration

> Read this when the user asks about bundler setup, project roots, config selection, scans, output format, generated state, HMR, production reports, or prepare/init.

## Supported hosts

PikaCSS uses Unplugin internally but officially supports only two host families:

| Family | Host | Import |
|---|---|---|
| Rollup | Vite | `@pikacss/unplugin-pikacss/vite` |
| Rollup | Rollup | `@pikacss/unplugin-pikacss/rollup` |
| Rollup | Rolldown | `@pikacss/unplugin-pikacss/rolldown` |
| Webpack | Webpack | `@pikacss/unplugin-pikacss/webpack` |
| Webpack | Rspack | `@pikacss/unplugin-pikacss/rspack` |

Other Unplugin hosts, including esbuild, Farm, and Bun, are unsupported and ship no public adapter entry point. Nuxt uses `@pikacss/nuxt-pikacss`.

## Adapter options are bootstrap-only

```ts
import pikacss from '@pikacss/unplugin-pikacss/vite'

export default defineConfig({
  plugins: [
    pikacss({
      config: './config/pika.config.ts', // optional explicit selector
      cwd: process.cwd(),               // optional generic host root override
    }),
  ],
})
```

Public generic adapter options are only:

| Option | Meaning |
|---|---|
| `config?: string` | Explicit canonical project config path, resolved from project root |
| `cwd?: string` | Generic-host project-root override |

Do not put `fnName`, scan, output format, reports, EngineConfig, or generated-file controls in bundler options. There is no inline EngineConfig path.

Nuxt module options expose only `config?: string`; Nuxt owns its project root internally.

## Canonical project config

Project semantics live exclusively in `pika.config.*` via `defineConfig()` from the directly installed outer package:

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  fnName: 'pika',
  cssModule: 'pika.css',
  transformedFormat: 'string',
  scan: {
    include: ['src/**/*.{ts,tsx,vue}'],
  },
  report: false,
  stateDir: '.pikacss',
  engine: {
    // EngineConfig
  },
})
```

Single form defaults `fnName`, `cssModule`, `transformedFormat`, scan, report, and stateDir. Multi-entry form requires each entry's `fnName` and `cssModule`, while `stateDir` is project-wide:

```ts
export default defineConfig([
  { fnName: 'pika', cssModule: 'pika.css', engine: {} },
  { fnName: 'adminPika', cssModule: 'admin-pika.css', engine: {} },
], {
  stateDir: '.pikacss',
})
```

## Config selection

Auto-discovery checks exactly these project-root paths:

- `pika.config.ts`
- `pika.config.mts`
- `pika.config.js`
- `pika.config.mjs`

Zero candidates is valid and produces the default single-entry project. More than one is an error. An explicit `config` path disables discovery and also supports the closed explicit JS/TS module extension set accepted by the Config host.

Filesystem-relative values authored in a selected config resolve from that config file's directory, not from a bundler-specific source directory.

## Scan semantics

Each entry owns `scan.include` / `scan.exclude`. Supplying either side replaces that side's defaults verbatim; no implicit merge occurs.

The canonical Config matcher owns scan semantics and is shared by Integration and ESLint. It operates on normalized absolute physical source paths; `stateDir` is always excluded as a system rule.

Dev follows authoritative physical modules encountered by the bundler. Build deterministically enumerates the configured filesystem scan universe. Virtual/generated host modules are outside the PikaCSS compilation source universe.

## Output format and callable roots

`fnName` names one compile-time root per entry. `transformedFormat` is `'string' | 'array'` and applies to the configured base call. There are no per-call `.str()` / `.arr()` variants.

```ts
export default defineConfig({
  fnName: 'css',
  transformedFormat: 'array',
})
```

Compiler, generated Typegen, ESLint, prepare, and bundler transforms all consume the same canonical entry settings.

## Generated state

The default generated-state root is `<projectRoot>/.pikacss`. `stateDir` relocates the whole state root; individual artifacts cannot be independently moved or disabled.

Important artifacts include:

- `<stateDir>/pika.gen.ts` — always-generated authoring TypeScript.
- `<stateDir>/previews/` — content-addressed hover preview assets where applicable.
- `<stateDir>/runs/<runId>/...` — invocation-owned runtime CSS files.

Import the configured logical `cssModule` (`'pika.css'` by default), not a physical runtime-CSS path.

Generic TypeScript projects must include/reference `<stateDir>/pika.gen.ts`. Run `pikacss prepare` before standalone type-aware tooling needs it.

## CLI lifecycle

```sh
pikacss init
pikacss prepare
pikacss prepare --config ./config/pika.config.ts
```

- `init` conservatively scaffolds one canonical config and prints setup guidance. It does not silently mutate unrelated files.
- `prepare` derives canonical project state and publishes Typegen/preview artifacts without scanning application usages or emitting production reports.
- Nuxt owns its framework preparation lifecycle and also ships a thin host-aware `pikacss` bin; its standalone `pikacss prepare` invokes the same shared Integration operation with Nuxt host identity.

## HMR / generation replacement

Config and frozen config-dependency changes derive a complete new `ProjectGeneration`; there is no partial entry reuse. Dev retains the previous complete generation when a replacement fails. Successful publication/activation swaps the whole generation behind the Integration barrier.

Plugins may register configuration file or direct directory-membership dependencies only during Engine initialization. The finalized dependency set is immutable for that generation; runtime resolver/use calls cannot dynamically expand watchers.

## Production reports

Report configuration belongs to each canonical project entry, not adapter options:

```ts
export default defineConfig({
  report: true,
  engine: {
    // e.g. designTokens plugin/config
  },
})
```

`{ output: './report.json' }` additionally writes the report to a config-relative path. Reports finalize only after a successful production build; prepare/dev do not run them.
