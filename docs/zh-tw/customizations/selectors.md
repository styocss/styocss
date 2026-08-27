---
title: Selectors
description: 定義 object-form static 與 dynamic selector semantics。
relatedPackages:
  - '@pikacss/core'
relatedSources:
  - packages/core/src/plugins/selectors.ts
category: customizations
order: 60
---

# Selectors {#selectors}

Selector definitions只使用 object grammar。

## Static selectors {#static-selectors}

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  engine: {
  selectors: {
    definitions: [
      { name: '@dark', value: 'html.dark $' },
      { name: '@sm', value: '@media (min-width: 640px)' },
    ],
  },
  },
})
```

`$` 代表目前產生的 atomic selector。

## Dynamic selectors {#dynamic-selectors}

Dynamic selector必須同時提供 pattern與明確 raw TypeScript `inputType`：

```ts
selectors: {
  definitions: [
    {
      pattern: /^@container-(.+)$/,
      inputType: '`@container-${string}`',
      resolve: ([, name]) => `@container ${name}`,
      autocomplete: ['@container-card', '@container-sidebar'],
    },
  ],
}
```

`autocomplete` 是 deterministic concrete Typegen members，不會從 runtime source hits學習新成員。Pattern不接受的 autocomplete value會被診斷並排除。

```ts
pika({
  'color': 'black',
  '@dark': { color: 'white' },
})
```

Selector value也可以是 `StyleItem[]`，因此可在 nested selector內組合 shortcut。

## 範例 {#examples}

<<< @/.examples/customizations/selectors.example.ts


## 下一步 {#next}

- [Shortcuts](/zh-tw/customizations/shortcuts)
- [Variables](/zh-tw/customizations/variables)
