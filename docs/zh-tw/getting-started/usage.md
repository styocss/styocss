---
title: 使用方式
description: 學習如何用 pika() 撰寫樣式，並了解常見的使用模式。
relatedPackages:
  - '@pikacss/core'
relatedSources:
  - packages/core/src/engine.ts
  - packages/core/src/types/public.ts
  - packages/integration/src/ctx.ts
  - packages/integration/src/tsCodegen.ts
  - scripts/css-data/generate-csstype.ts
category: getting-started
order: 30
translation:
  sourceFile: docs/getting-started/usage.md
  sourceCommit: 561c44017f7ba5f409d5e2c315611873915053af
  sourceBlob: 804d4bbfecabd173166452fa8dc7a0e090c0a593
---

# 使用方式 {#usage}

在 JavaScript 物件裡用 CSS 屬性名稱撰寫樣式，PikaCSS 會在建置時期把它們轉換成 atomic CSS。

## 你的第一個樣式化元件 {#your-first-styled-component}

除了 [安裝與設定](/zh-tw/getting-started/setup) 的步驟以外，不需要其他設定；直接在元件裡呼叫 `pika` 全域變數即可。不要匯入它：建置外掛會在建置時期替換每一次呼叫。

::: code-group

```vue [Vue]
<!-- App.vue -->
<script setup lang="ts">
const buttonClass = pika({
  padding: '0.5rem 1rem',
  border: 'none',
  borderRadius: '8px',
  backgroundColor: '#3b82f6',
  color: 'white',
  cursor: 'pointer',
  '$:hover': {
    backgroundColor: '#2563eb',
  },
})
</script>

<template>
  <button :class="buttonClass">Click me</button>
</template>
```

```tsx [React]
// Button.tsx
const buttonClass = pika({
  padding: '0.5rem 1rem',
  border: 'none',
  borderRadius: '8px',
  backgroundColor: '#3b82f6',
  color: 'white',
  cursor: 'pointer',
  '$:hover': {
    backgroundColor: '#2563eb',
  },
})

export function Button() {
  return <button className={buttonClass}>Click me</button>
}
```

:::

在建置時期，外掛會把 `pika()` 呼叫替換成一段由產生出來的 class 名稱組成的字串常值：

```ts
const buttonClass = 'pk-a pk-b pk-c pk-d pk-e pk-f pk-g'
```

轉換後的呼叫一律使用單引號字串常值，因此即使放在雙引號包住的 Vue 樣板屬性裡（例如 `:class="pika({ ... })"`），替換結果仍然有效。

每一條宣告在產生出來的 CSS（透過 `import 'pika.css'` 匯入）裡都會變成各自獨立的原子 class：

<<< @/zh-tw/.examples/getting-started/first-component.example.pikaout.css [generated CSS]

## pika() 變體 {#pika-variants}

PikaCSS 提供多種函式變體，對應不同的輸出格式與使用情境：

### pika() {#pika}

預設的函式。回傳一個以空格分隔的原子 class 名稱字串。

```ts
const className = pika({ color: 'red', fontSize: '16px' })
// → 'pk-a pk-b'
```

### pika.str() {#pika-str}

明確的字串變體。即使整合設定成 `transformedFormat: 'array'`，也一律回傳以空格分隔的 class 名稱字串；在預設的 `transformedFormat: 'string'` 下，行為與 `pika()` 完全相同。

```ts
const className = pika.str({ color: 'red' })
// → 'pk-a'
```

### pika.arr() {#pika-arr}

陣列變體。回傳一個由個別 class 名稱字串組成的陣列，而不是單一串接好的字串。對於接受 class 名稱陣列的框架或工具很有用。

```ts
const classNames = pika.arr({ color: 'red', fontSize: '16px' })
// → ['pk-a', 'pk-b']
```

::: tip 提示
所有變體都接受相同的引數，差別只在回傳型別。ESLint 外掛會平等地驗證所有變體。
:::

## 範例 {#examples}

### 基本的 CSS 屬性 {#basic-css-properties}

傳入一個帶有標準 CSS 屬性的樣式定義物件：

::: info CSS 數值
請把看起來是數字的 CSS 值寫成 CSS 字串，例如 `opacity: '0.5'` 或 `zIndex: '10'`。PikaCSS 刻意不解讀 JavaScript number，也不推斷 CSS 單位。產生的公開型別只會在可無歧義使用無單位零值的 length 類型位置接受數字 `0`，因此 `margin: 0` 合法，但 `margin: 8`、`opacity: 0.5`、`zIndex: 10` 都會被拒絕。
:::

::: code-group

<<< @/zh-tw/.examples/getting-started/basic.example.pikain.ts [輸入]

<<< @/zh-tw/.examples/getting-started/basic.example.pikaout.css [輸出]

:::

### 偽類與偽元素 {#pseudo-classes-and-pseudo-elements}

使用 `$:hover`、`$:focus`、`$::before` 等等來加入偽選擇器（pseudo selector）：

::: code-group

<<< @/zh-tw/.examples/getting-started/pseudo.example.pikain.ts [輸入]

<<< @/zh-tw/.examples/getting-started/pseudo.example.pikaout.css [輸出]

:::

### 回應式樣式 {#responsive-styles}

使用 `@media` 查詢當作 key，對應回應式斷點：

::: code-group

<<< @/zh-tw/.examples/getting-started/responsive.example.pikain.ts [輸入]

<<< @/zh-tw/.examples/getting-started/responsive.example.pikaout.css [輸出]

:::

### 自訂選擇器 {#custom-selectors}

使用你在引擎設定中定義的自訂選擇器名稱。這個範例需要先註冊 `@dark` 選擇器：

```ts
// pika.config.ts
import { defineEngineConfig } from '@pikacss/core'

export default defineEngineConfig({
  selectors: {
    definitions: [
      ['@dark', 'html.dark $'],
    ],
  },
})
```

::: code-group

<<< @/zh-tw/.examples/getting-started/custom-selector.example.pikain.ts [輸入]

<<< @/zh-tw/.examples/getting-started/custom-selector.example.pikaout.css [輸出]

:::

### Shortcut 參考 {#shortcut-references}

以字串引數的形式參考具名的 shortcut：

```ts
// 假設設定中已定義了一個名為 "flex-center" 的 shortcut
const className = pika('flex-center')
```

## 下一步 {#next}

- [引擎設定](/zh-tw/getting-started/engine-config)：自訂引擎的行為。
- [客製化](/zh-tw/customizations/selectors)：定義自訂選擇器。
