# Migration Guide

This guide covers behavior changes that require action when upgrading. For the
full per-release history see the
[GitHub Releases](https://github.com/pikacss/pikacss/releases).

## Upgrading toward 1.0 (from `0.0.x`)

The following changes harden the config/transform boundary for 1.0. They are
breaking relative to earlier `0.0.x` releases.

### `autoCreateConfig` now defaults to `false`

Previously the plugin silently scaffolded a `pika.config.js` when no config was
found. A build plugin should not write files into your repository, so the
default is now `false`.

- **No config yet?** Create one explicitly:

  ```ts
  // pika.config.ts
  import { defineEngineConfig } from '@pikacss/unplugin-pikacss'

  export default defineEngineConfig({
    // ...
  })
  ```

- **Want the old behavior?** Set it back on:

  ```ts
  PikaCSS({ autoCreateConfig: true })
  ```

When no config is found the engine still runs with defaults; a warning explains
how to add one.

### Config errors now fail the build

A `pika.config.*` that throws while evaluating, or an engine that fails to
build from it, now **fails the build** instead of silently falling back to an
empty config (which produced green CI but missing styles).

- **Build mode**: the error is thrown and the build fails.
- **Dev/serve mode**: the dev server stays up on the last known-good engine
  (or a default engine on the first run) and logs the error, so a transient bad
  edit doesn't kill the server.

Fix the reported config error to restore output.

### Config discovery is deterministic and root-only

Config lookup no longer recurses the whole project tree. It now checks a fixed
set of candidates **in the project root only**, in priority order:

```
pika.config.{ts,mts,cts,js,mjs,cjs}  →  pikacss.config.{ts,mts,cts,js,mjs,cjs}
```

If your config lived in a subdirectory and was picked up by the old recursive
search, move it to the project root or pass an explicit path via the `config`
option. When multiple candidates exist, the highest-priority one is used and
the rest are logged.

### Default scan globs

- **Include** now covers every extension the compiler supports, adding
  `.mjs`, `.cjs`, `.mts`, `.cts`:
  `**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,vue}`.
- **Exclude** now also skips `.git`, `.nuxt`, `.output`, and `coverage` in
  addition to `node_modules` and `dist`.

An explicit `scan.include` / `scan.exclude` still wins verbatim.

### ESLint static-usage migration

The old `pikacss/no-dynamic-args` rule is removed. Configure the async factory
so `pikacss/static-usage` can load the canonical PikaCSS project config:

```ts
import pikacss from '@pikacss/eslint-config'

export default [await pikacss({ config: './pika.config.mts' })]
```

Configured root names and scan ownership now come only from that canonical
config. The manual `{ fnName }` factory option and the legacy `.str`/`.arr`
rule forms are removed; `config` is the only factory option. The rule reports
configured roots outside the compiler's bounded static subset while leaving
local bindings alone.

## ESM-only

All packages are ESM-only. If you load PikaCSS from a bundler config, that
config must be ESM (`.mjs` or `"type": "module"`). See [SUPPORT.md](./SUPPORT.md).
