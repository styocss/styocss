---
title: 使用方式
description: 了解編譯時期 pika() authoring model 與常見樣式寫法。
relatedPackages:
  - '@pikacss/core'
  - '@pikacss/config'
relatedSources:
  - packages/core/src/types/public.ts
  - packages/core/src/typegen/render.ts
  - packages/config/src/types.ts
category: getting-started
order: 30
---

# 使用方式 {#usage}

把 CSS property 與 nested selector 寫成靜態 JavaScript 值，傳給設定好的 Pika callable。Integration 會在 build time求值並把整個 call取代為 atomic class names。

## 第一個元件 {#your-first-styled-component}

預設 single-entry project的 callable 是 global `pika`，不要 import：

```vue
<script setup lang="ts">
const buttonClass = pika({
  padding: '0.5rem 1rem',
  borderRadius: '8px',
  backgroundColor: '#3b82f6',
  color: 'white',
  '$:hover': { backgroundColor: '#2563eb' },
})
</script>

<template>
  <button :class="buttonClass">Click me</button>
</template>
```

每個 declaration會變成 logical CSS module中的 atomic rule：

<<< @/.examples/getting-started/first-component.example.pikaout.css [產生的 CSS]

## 只有一個 callable，輸出格式由 project config決定 {#one-callable-one-configured-output-format}

現在只有設定好的 base callable，例如 `pika(...)`。舊的 `.str()` / `.arr()` callable variants已移除。

`transformedFormat` 決定 replacement shape：

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  transformedFormat: 'array', // 預設為 'string'
})
```

`'string'` 會產生空白分隔的 class string；`'array'` 會產生 class-name array。Compiler、Typegen 與 ESLint 都讀同一份 canonical project config。

## 靜態 authoring限制 {#static-authoring-requirement}

PikaCSS 是 compile-time transform。Base-call arguments必須落在支援的 bounded-static expression grammar內；任意 runtime value與一般函式呼叫不會被 PikaCSS 執行。

Plugin可提供 `pika.sc`、`pika.var`、`pika.kf`、`pika.tk` 等 static authoring members。這些 member只允許出現在 base `pika(...)` argument tree裡，並在 prepare階段求值。

## 常見寫法 {#common-patterns}

### 基本 CSS property {#basic-css-properties}

::: code-group

<<< @/.examples/getting-started/basic.example.pikain.ts [輸入]

<<< @/.examples/getting-started/basic.example.pikaout.css [輸出]

:::

### Pseudo selector {#pseudo-classes-and-pseudo-elements}

`$` 代表目前產生的 selector：

::: code-group

<<< @/.examples/getting-started/pseudo.example.pikain.ts [輸入]

<<< @/.examples/getting-started/pseudo.example.pikaout.css [輸出]

:::

### Responsive styles {#responsive-styles}

::: code-group

<<< @/.examples/getting-started/responsive.example.pikain.ts [輸入]

<<< @/.examples/getting-started/responsive.example.pikaout.css [輸出]

:::

### 自訂 selector {#custom-selectors}

Project config內使用現行 object-only grammar：

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  engine: {
    selectors: {
      definitions: [
        { name: '@dark', value: 'html.dark $' },
      ],
    },
  },
})
```

::: code-group

<<< @/.examples/getting-started/custom-selector.example.pikain.ts [輸入]

<<< @/.examples/getting-started/custom-selector.example.pikaout.css [輸出]

:::

### Shortcut {#shortcuts}

Shortcut name本身就是普通 StyleItem，可以直接與 inline styles組合：

```ts
pika('flex-center', { gap: '1rem' })
```

Shortcut definition內也能用 `StyleItem[]` 組合其他 shortcut；不再使用 `__shortcut` 偽屬性。

## 下一步 {#next}

- [Engine Config](/zh-tw/getting-started/engine-config)
- [Selectors](/zh-tw/customizations/selectors)
- [Shortcuts](/zh-tw/customizations/shortcuts)
