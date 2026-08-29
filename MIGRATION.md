# Migration Guide

This guide covers the current pre-1.0 architecture migration. Historical release-by-release details remain in [GitHub Releases](https://github.com/pikacss/pikacss/releases).

The central change is that **one canonical `pika.config.*` project model now owns compiler, Typegen, ESLint, prepare, bundler, and framework semantics**. Compatibility channels that could disagree with that model have been removed from public APIs.

## 1. Move project semantics into `defineConfig()`

Application project config is no longer a bare `EngineConfig`. Import `defineConfig()` from the directly installed outer integration and put Engine semantics under `engine`:

```ts
// before
import { defineEngineConfig } from '@pikacss/core'

export default defineEngineConfig({
  plugins: [],
})
```

```ts
// now
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  fnName: 'pika',
  cssModule: 'pika.css',
  transformedFormat: 'string',
  engine: {
    plugins: [],
  },
})
```

Use `defineEngineConfig()` only when you are intentionally authoring a standalone Core `EngineConfig`, such as low-level Engine/plugin tests.

### Adapter semantic options were removed

Generic bundler adapters now accept only bootstrap/config selection:

```ts
pikacss({
  config: './config/pika.config.ts',
  cwd: process.cwd(),
})
```

Move old adapter-owned semantics as follows:

| Removed public adapter/input surface | Replacement |
|---|---|
| inline `EngineConfig` / `configOrPath` object | file-backed canonical `defineConfig()` |
| adapter `fnName` | entry `fnName` |
| adapter `transformedFormat` | entry `transformedFormat` |
| adapter `scan` | entry `scan` |
| adapter `report` | entry `report` |
| `currentPackageName` | host-internal public-entry identity; not user config |
| `autoCreateConfig` | explicit `pikacss init` or valid no-config defaults |
| `tsCodegen` | always-generated `<stateDir>/pika.gen.ts` |

Nuxt module options are `{ config?: string }`; project semantics still come from the same canonical config.

## 2. Update config discovery assumptions

Automatic discovery checks exactly these project-root candidates:

```text
pika.config.ts
pika.config.mts
pika.config.js
pika.config.mjs
```

- Zero candidates is valid and behaves like an empty default single-entry config.
- More than one candidate is a hard selection error; there is no priority winner.
- Legacy `pikacss.config.*` names are not auto-discovered.
- Explicit `config` selection uses the closed supported JS/TS module extension set and disables auto-discovery.
- Filesystem-relative values authored in a selected config resolve from that config file's directory.

## 3. Wire generated state instead of a movable Typegen file

Typegen is now a first-class generated-state artifact:

```text
.pikacss/
├── pika.gen.ts
├── previews/
└── runs/
```

There is no independent declaration-file location/disable switch. To relocate generated files, configure the whole project `stateDir`.

Generic TypeScript projects should include/reference `<stateDir>/pika.gen.ts`. Before editor/typecheck/ESLint workflows that can run before a bundler build, execute:

```sh
pikacss prepare
```

`pikacss init` conservatively creates a canonical config and prints setup guidance; it replaces the old build-side-effect config scaffolding behavior.

## 4. Remove per-call output variants

Only the configured base callable exists, for example `pika({ color: 'red' })`.

The old `pika.str(...)` / `pika.arr(...)` forms are removed. Set `transformedFormat: 'string' | 'array'` on the owning project entry instead. Compiler, Typegen, and ESLint all read the same setting.

## 5. Migrate Core semantic definitions to object grammar

Selectors, shortcuts, keyframes, and variables now use explicit domain-owned objects.

### Selectors

```ts
export const selectors = {
  definitions: [
    { name: '@dark', value: 'html.dark $' },
    {
      pattern: /^state-(.+)$/,
      // eslint-disable-next-line no-template-curly-in-string -- raw TypeScript template-literal type source
      inputType: '`state-${string}`',
      resolve: ([, state]) => `&[data-state="${state}"]`,
      autocomplete: ['state-open', 'state-closed'],
    },
  ],
}
```

### Shortcuts

```ts
export const shortcuts = {
  definitions: [
    { name: 'btn', value: { padding: '0.5rem 1rem' } },
    { name: 'btn-primary', value: ['btn', { color: 'white' }] },
  ],
}
```

The old `__shortcut` pseudo-property is removed. Compose shortcuts as ordinary string style items or with a shortcut definition's `value: StyleItem[]`.

### Keyframes

```ts
export const keyframes = {
  definitions: [
    {
      name: 'fade-in',
      frames: { from: { opacity: '0' }, to: { opacity: '1' } },
    },
  ],
}
```

### Variables

Primitive leaves are removed:

```ts
export const variables = {
  definitions: {
    '--brand': {
      value: '#3b82f6',
      suggest: { asValueOf: ['color', 'backgroundColor'] },
    },
  },
}
```

Use `suggest`, not the old variable `autocomplete` metadata.

## 6. Migrate autocomplete/Typegen ownership

The global `EngineConfig.autocomplete`, `appendAutocomplete()`, `DefineAutocomplete`, and plugin-authored `PikaAugment.Autocomplete` flow are removed.

- Selector/shortcut dynamic rules own `inputType` plus deterministic concrete `autocomplete` members.
- `@pikacss/plugin-icons` now expects `icons.autocomplete` entries to be unprefixed logical icon IDs. If you previously wrote a shortcut-prefixed value such as `i-mdi:home`, change it to `mdi:home`; the configured icon shortcut prefix is applied when completions are generated.
- Variables own leaf-local `suggest` metadata.
- Existing Core semantic subsystems generate their own Typegen.
- A plugin with a genuinely new authoring surface uses owner-bound `engine.typegen.add(...)` during `configureEngine`.
- A plugin-defined static Pika root uses the same owner's `engine.pika.extendStatic(...)` capability.

Generated Typegen is finalized once per Engine generation and does not learn from transformed runtime usages.

## 7. Update plugin `configureEngine`

`configureEngine` now receives one `EngineConfigurator`, not a mutable raw Engine plus a second context:

```ts
defineEnginePlugin({
  name: 'my-plugin',
  configureRawConfig(config) {
    config.shortcuts = {
      definitions: [
        ...(config.shortcuts?.definitions ?? []),
        { name: 'my-shortcut', value: { display: 'flex' } },
      ],
    }
  },
  configureEngine(engine) {
    engine.runtime.addPreflight('html { box-sizing: border-box; }')
  },
})
```

Config-backed selectors/shortcuts/variables/keyframes expose no public runtime `.add()` producer ingress. Lower those semantics in `configureRawConfig` instead.

Configuration dependencies are initialization-only. Register them through `engine.runtime.addConfigDependency()` (or the directory-membership capability) during Engine construction. The dependency set freezes with the generation; runtime resolution cannot expand active watchers.

## 8. Update ESLint

The old `pikacss/no-dynamic-args` rule and manual `{ fnName }` rule/factory configuration are removed.

```ts
import pikacss from '@pikacss/eslint-config'

export default [
  await pikacss(),
]
```

Use `await pikacss({ config: './pika.config.mts' })` only to select a custom config path. `pikacss/static-usage` derives roots and scan ownership from that canonical config.

## 9. Update bundler support assumptions

Official bundler support is intentionally limited to:

- Vite, Rollup, Rolldown
- Webpack, Rspack

Although the implementation uses Unplugin internally, esbuild, Farm, Bun, and other Unplugin hosts are unsupported and ship no public PikaCSS adapter entry point. Import an explicit supported subpath such as `@pikacss/unplugin-pikacss/vite`.

The package root is no longer a universal executable plugin export.

## 10. Low-level Integration API

The legacy public `createCtx()` / `IntegrationContextOptions` compatibility surface is no longer exported from `@pikacss/integration`. Host adapters should use `createPikaCSSContext()`; programmatic workflows should use `preparePikaCSS()` / `initPikaCSS()`.

## ESM-only / Node

PikaCSS packages are ESM-only and Node-targeted packages require Node.js 22 or later. See [SUPPORT.md](./SUPPORT.md).
