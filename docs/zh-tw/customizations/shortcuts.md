---
title: Shortcuts
description: 定義可重用的 object-form StyleItem aliases與 dynamic shortcut families。
relatedPackages:
  - '@pikacss/core'
relatedSources:
  - packages/core/src/plugins/shortcuts.ts
category: customizations
order: 70
translation:
  sourceFile: docs/customizations/shortcuts.md
  sourceCommit: 33431c15728d378cc7bd9c37fd5c3b3e86e51318
  sourceBlob: 7948299edeb5801f54969d2a7a967a33f3a759ff
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

`value` 可以是一個 style item或 `StyleItem[]`。Array composition就是現行 shortcut組合方式，已取代舊的 `__shortcut` 偽屬性。

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

`inputType` 描述完整 authoring input family；`autocomplete` 提供 deterministic concrete members與 hover文件，runtime usage不會改寫 Typegen。

## 範例 {#examples}

<<< @/.examples/customizations/shortcuts.example.ts


## 下一步 {#next}

- [Autocomplete](/zh-tw/customizations/autocomplete)
- [Selectors](/zh-tw/customizations/selectors)
