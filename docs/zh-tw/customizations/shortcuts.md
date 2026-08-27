---
title: Shortcuts
description: 定義可重用的 object-form StyleItem aliases與 dynamic shortcut families。
relatedPackages:
  - '@pikacss/core'
relatedSources:
  - packages/core/src/plugins/shortcuts.ts
category: customizations
order: 70
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
        name: 'btn',
        value: {
          padding: '0.5rem 1rem',
          borderRadius: '0.25rem',
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
pika('btn-primary')
pika('btn-primary', { marginTop: '1rem' })
```

## Dynamic shortcuts {#dynamic-shortcuts}

```ts
shortcuts: {
  definitions: [
    {
      pattern: /^size-(.+)$/,
      inputType: '`size-${string}`',
      resolve: ([, size]) => ({ width: size, height: size }),
      autocomplete: ['size-1rem', 'size-2rem'],
    },
  ],
}
```

`inputType` 描述完整 authoring input family；`autocomplete` 提供 deterministic concrete members與 hover文件，runtime usage不會改寫 Typegen。

## 範例 {#examples}

<<< @/.examples/customizations/shortcuts.example.ts


## 下一步 {#next}

- [Autocomplete](/zh-tw/customizations/autocomplete)
- [Selectors](/zh-tw/customizations/selectors)
