---
title: Engine Config
description: 設定 canonical PikaCSS project 與 Engine semantics。
relatedPackages:
  - '@pikacss/config'
  - '@pikacss/core'
relatedSources:
  - packages/config/src/types.ts
  - packages/core/src/types/public.ts
category: getting-started
order: 40
translation:
  sourceFile: docs/getting-started/engine-config.md
  sourceCommit: 33431c15728d378cc7bd9c37fd5c3b3e86e51318
  sourceBlob: 2a4222c1b2bc260b883f0e7a31f4904bef517f63
---

# Engine Config {#engine-config}

`pika.config.*` 是 PikaCSS project semantics唯一的公開來源。請從直接安裝的 outer package使用 `defineConfig()`；Engine-specific options放在 `engine`。

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  fnName: 'pika',
  cssModule: 'pika.css',
  transformedFormat: 'string',
  engine: {},
})
```

## Project fields {#project-fields}

| Property | 說明 |
|---|---|
| `engine` | 此 entry的 `EngineConfig`。 |
| `fnName` | Compile-time callable root；single form預設 `'pika'`。 |
| `cssModule` | Logical runtime CSS module；single form預設 `'pika.css'`。 |
| `transformedFormat` | `'string'` 或 `'array'`；預設 `'string'`。 |
| `scan` | 此 entry的 source include/exclude patterns。 |
| `report` | Optional production report。 |
| `stateDir` | Single form的 whole-project generated-state root；預設 `.pikacss`。 |

設定檔內相對 filesystem values以該設定檔目錄為基準。

## Multi-entry projects {#multi-entry-projects}

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig([
  { fnName: 'pika', cssModule: 'pika.css', engine: {} },
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

Multi form中 `fnName` 與 `cssModule` 必須在整份 config內唯一。每個 entry的 runtime/Engine partition彼此隔離，但共用 project generated-state root。

## Engine fields {#engine-fields}

| Property | 說明 |
|---|---|
| `prefix` | Atomic class user prefix，預設 `'pk-'`。 |
| `defaultSelector` | Atomic selector template；`%` 是 atomic ID slot。 |
| `plugins` | Engine plugins。 |
| `layers` | CSS layer priority map。 |
| `defaultPreflightsLayer` | 未指定 layer 的 preflight output 所使用的預設 layer。 |
| `defaultUtilitiesLayer` | Atomic utilities 所使用的預設 layer。 |
| `preflights` | Base/preflight definitions。 |
| `cssImports` | CSS `@import` rules。 |
| `important` | `!important` policy。 |
| `selectors` | Selector semantics與其 Typegen metadata。 |
| `shortcuts` | Shortcut semantics與其 Typegen metadata。 |
| `variables` | Object-only local/external variables。 |
| `keyframes` | Object-only keyframe definitions。 |

現在沒有 project-wide `autocomplete` bucket。Editor suggestions由能正確解釋語義的 domain各自擁有：selector/shortcut definitions提供 concrete autocomplete members，variables使用 `suggest`，plugins則透過所屬 subsystem或 Typegen capability貢獻 authoring metadata。

## 範例 {#examples}

<<< @/.examples/customizations/selectors.example.ts


## 下一步 {#next}

- [ESLint 設定](/zh-tw/getting-started/eslint-config)
- [Customizations](/zh-tw/customizations/layers)
- [官方外掛](/zh-tw/official-plugins/reset)
