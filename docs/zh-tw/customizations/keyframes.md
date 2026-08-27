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

Keyframes 使用 object definitions；除非停用 pruning，否則只會輸出實際需要的 keyframes：

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
      {
        name: 'slide-in',
        frames: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        description: 'Slide from the left',
      },
    ],
  },
  },
})
```

在一般 CSS property 中使用 keyframe name：

```ts
pika({ animation: 'fade-in 0.3s ease-in-out' })
```

Subsystem 也會透過 static Pika authoring surface 暴露已設定的 keyframes，供支援的 compile-time composition 使用；runtime usage 不會反向改寫 generated Typegen。

未使用的 keyframes 預設會被 pruning；若外部 CSS 會使用，可在 definition 或 keyframes config 設定 `pruneUnused: false`。

## 範例 {#examples}

<<< @/.examples/customizations/keyframes.example.ts


## 下一步 {#next}

- [Variables](/zh-tw/customizations/variables)
- [Selectors](/zh-tw/customizations/selectors)
