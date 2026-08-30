---
title: Selectors
description: 定義 object-form static 與 dynamic selector semantics。
relatedPackages:
  - '@pikacss/core'
relatedSources:
  - packages/core/src/plugins/selectors.ts
  - packages/core/src/typegen/preview.ts
  - packages/core/src/typegen/jsdoc.ts
category: customizations
order: 60
translation:
  sourceFile: docs/customizations/selectors.md
  sourceCommit: f54e8ced70d2febf6f32014b93f6076d0e319fc8
  sourceBlob: 72d737d3711b14ba5a70dbaa2290650f8060bf83
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
      { name: '@light', value: 'html:not(.dark) $' },
      { name: '@sm', value: '@media (min-width: 640px)' },
    ],
  },
  },
})
```

`$` 代表目前產生的 atomic selector。Core 會嘗試為每個已設定的 static selector 產生 resolved **PikaCSS Preview**，顯示於 Typegen / IDE hover 文件。preview 產生成功時，手動撰寫的 `description` 會顯示在 preview 前；若僅 preview 的 resolution 失敗，PikaCSS 會回報診斷，但仍保留該 selector member 與其 description。

## Dynamic selectors {#dynamic-selectors}

Dynamic selector必須同時提供 pattern與明確 raw TypeScript `inputType`：

```ts
export default defineConfig({
  engine: {
  selectors: {
    definitions: [
      {
        pattern: /^@container-(.+)$/,
        inputType: '`@container-${string}`',
        resolve: ([, name]) => `@container ${name}`,
        autocomplete: ['@container-card', '@container-sidebar'],
        description: 'Named container query',
      },
    ],
  },
  },
})
```

`autocomplete` 是 deterministic concrete Typegen members。每個接受的 concrete member 都會使用與 runtime 相同的 selector transform pipeline 產生 resolved **PikaCSS Preview**。它不會從 runtime source hits 學習新成員。Pattern 不接受的 autocomplete value 會被診斷並排除。若僅 preview 的 resolution 失敗，PikaCSS 會回報診斷，但仍保留 concrete Typegen member；手動撰寫的 `description` 也會繼續保留。

```ts
pika({
  'color': 'black',
  '@dark': { color: 'white' },
  '@sm': { fontSize: '14px' },
})
```

Selector value也可以是 `StyleItem[]`，因此可在 nested selector內組合 shortcut。

## 範例 {#examples}

<<< @/.examples/customizations/selectors.example.ts


## 下一步 {#next}

- [Shortcuts](/zh-tw/customizations/shortcuts)
- [Variables](/zh-tw/customizations/variables)
