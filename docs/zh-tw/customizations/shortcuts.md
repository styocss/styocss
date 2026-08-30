---
title: Shortcuts
description: 定義可重用的 object-form StyleItem aliases與 dynamic shortcut families。
relatedPackages:
  - '@pikacss/core'
relatedSources:
  - packages/core/src/plugins/shortcuts.ts
  - packages/core/src/typegen/preview.ts
  - packages/core/src/typegen/jsdoc.ts
category: customizations
order: 70
translation:
  sourceFile: docs/customizations/shortcuts.md
  sourceCommit: f54e8ced70d2febf6f32014b93f6076d0e319fc8
  sourceBlob: 29f6eacd6f8d2a54ef1e7c41db68cf509ef3bbc2
---

# Shortcuts {#shortcuts}

Shortcut是可重用的 `StyleItem` sequence。使用時 shortcut name本身就是普通 string style item。

## Static shortcuts {#static-shortcuts}

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  engine: {
  shortcuts: {
    definitions: [
      {
        name: 'flex-center',
        value: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
      },
      {
        name: 'btn',
        value: {
          'padding': '0.5rem 1rem',
          'borderRadius': '0.25rem',
          '$:hover': { opacity: '0.8' },
        },
      },
      {
        name: 'btn-primary',
        value: ['btn', { backgroundColor: 'royalblue', color: 'white' }],
      },
    ],
  },
  },
})
```

`value` 可以是一個 style item或 `StyleItem[]`。Array composition就是現行 shortcut組合方式，已取代舊的 `__shortcut` 偽屬性。每個已設定的 static shortcut 在能產生可渲染 CSS 時，都會在 Typegen / IDE hover 文件中取得 resolved **PikaCSS Preview**。手動撰寫的 `description` 會額外保留，並顯示在 preview 前。

```ts
pika('flex-center')
pika('btn-primary', { marginTop: '1rem' })
```

## Dynamic shortcuts {#dynamic-shortcuts}

```ts
export default defineConfig({
  engine: {
  shortcuts: {
    definitions: [
      {
        pattern: /^size-(.+)$/,
        inputType: '`size-${string}`',
        resolve: ([, size]) => ({ width: size, height: size }),
        autocomplete: ['size-1rem', 'size-2rem'],
      },
    ],
  },
  },
})
```

`inputType` 描述完整 authoring input family；`autocomplete` 提供 deterministic concrete members。preview resolution 成功時，每個接受的 member 都會取得 resolved **PikaCSS Preview**，以及 resolver 提供的 preview image（若有）。Preview resolution 會遵循 runtime plugin transform 順序，但使用隔離的 plugin state，而且不會 commit atomic styles 或寫入 runtime shortcut 快取。若 plugin state 無法安全隔離，或任何其他僅 preview 的步驟失敗，PikaCSS 會回報診斷，並保留 concrete Typegen member 與手動撰寫的 `description`。Runtime source usage 不會改寫 Typegen。

## 範例 {#examples}

<<< @/.examples/customizations/shortcuts.example.ts


## 下一步 {#next}

- [Autocomplete](/zh-tw/customizations/autocomplete)
- [Selectors](/zh-tw/customizations/selectors)
