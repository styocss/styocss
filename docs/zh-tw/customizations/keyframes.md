---
title: Keyframes
description: 使用 object-form 定義 CSS keyframes與 generated authoring metadata。
relatedPackages:
  - '@pikacss/core'
relatedSources:
  - packages/core/src/plugins/keyframes.ts
category: customizations
order: 50
---

# Keyframes {#keyframes}

Keyframes使用 object definitions：

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  engine: {
  keyframes: {
    definitions: [
      {
        name: 'fade-in',
        frames: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
    ],
  },
  },
})
```

```ts
pika({ animation: 'fade-in 0.3s ease-in-out' })
```

未使用的 keyframes預設會被 pruning；若外部 CSS會使用，可在 definition或 config設定 `pruneUnused: false`。Runtime source usage不會反向改寫 Typegen。

## 範例 {#examples}

<<< @/.examples/customizations/keyframes.example.ts


## 下一步 {#next}

- [Variables](/zh-tw/customizations/variables)
- [Selectors](/zh-tw/customizations/selectors)
