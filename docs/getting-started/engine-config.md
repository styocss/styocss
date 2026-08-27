---
title: Engine Config
description: Configure the canonical PikaCSS project and its Engine semantics.
relatedPackages:
  - '@pikacss/config'
  - '@pikacss/core'
relatedSources:
  - 'packages/config/src/types.ts'
  - 'packages/core/src/types/public.ts'
category: getting-started
order: 40
---

# Engine Config

`pika.config.*` is the sole public source of PikaCSS project semantics. Author it with `defineConfig()` from the directly installed outer package; Engine-specific options live under `engine`.

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  fnName: 'pika',
  cssModule: 'pika.css',
  transformedFormat: 'string',
  engine: {
    // EngineConfig
  },
})
```

## Project fields

| Property | Description |
|---|---|
| `engine` | The `EngineConfig` for this entry. |
| `fnName` | Compile-time callable root. Default: `'pika'` in single form. |
| `cssModule` | Logical runtime CSS module. Default: `'pika.css'` in single form. |
| `transformedFormat` | Base-call replacement shape: `'string'` or `'array'`. Default: `'string'`. |
| `scan` | Entry-owned source include/exclude patterns. |
| `report` | Optional final production report behavior. |
| `stateDir` | Whole-project generated-state root in single form. Default: `.pikacss`. |

Relative filesystem values resolve from the selected config file's directory. Auto-discovery allows zero or exactly one canonical root config; multiple candidates are an error.

## Multi-entry projects

Explicit multi form creates isolated compile/runtime entries while sharing one generated-state root:

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig([
  {
    fnName: 'pika',
    cssModule: 'pika.css',
    engine: {},
  },
  {
    fnName: 'adminPika',
    cssModule: 'admin-pika.css',
    scan: { include: 'admin/**/*.{ts,tsx,vue}' },
    engine: {},
  },
], {
  stateDir: '.pikacss',
})
```

`fnName` and `cssModule` must be unique across entries. Import each logical CSS module where that entry's stylesheet is needed.

## Engine fields

| Property | Description |
|---|---|
| `prefix` | User-controlled prefix for generated atomic classes. Default: `'pk-'`. |
| `defaultSelector` | Atomic selector template; `%` is the atomic ID slot. |
| `plugins` | Engine plugins, evaluated through the Engine lifecycle. |
| `layers` | CSS layer priority map. |
| `defaultPreflightsLayer` | Default layer for preflight output. |
| `defaultUtilitiesLayer` | Default layer for atomic utilities. |
| `preflights` | Base/preflight definitions. |
| `cssImports` | CSS `@import` rules. |
| `important` | `!important` policy. |
| `selectors` | Static/dynamic selector definitions and their Typegen metadata. |
| `shortcuts` | Static/dynamic shortcut definitions and their Typegen metadata. |
| `variables` | Object-only local/external CSS variable definitions. |
| `keyframes` | Object-only keyframe definitions. |

There is no project-wide `autocomplete` bucket. Editor suggestions are owned by the semantic domain that knows what they mean: selector/shortcut definitions expose concrete autocomplete members, variables expose `suggest`, and plugins contribute Typegen through their owning subsystem.

Official plugins augment `EngineConfig` through `@pikacss/core`; install the plugin package and place its plugin-specific configuration under `engine`.

## Examples

<<< @/.examples/customizations/selectors.example.ts

## Next

- [ESLint Config](/getting-started/eslint-config)
- [Customizations](/customizations/layers)
- [Official Plugins](/official-plugins/reset)
