---
title: 什麼是 PikaCSS
description: PikaCSS 概觀：即時、隨需產生的 atomic CSS-in-JS 引擎。
relatedPackages:
  - '@pikacss/core'
relatedSources:
  - packages/core/src/engine.ts
category: getting-started
order: 10
translation:
  sourceFile: docs/getting-started/what-is-pikacss.md
  sourceCommit: 36ab046b5f27060274a79d160c9b43606652d780
  sourceBlob: 09005607501703bd735e4b8444fd5382d4016c6d
---

# 什麼是 PikaCSS {#what-is-pikacss}

PikaCSS 是一套即時、隨需產生的 atomic CSS-in-JS 引擎，會在建置時期把 CSS-in-JS 樣式定義轉換成 atomic CSS，且沒有任何執行階段負擔。

## 主要特色 {#key-features}

### 零設定 {#zero-config}

PikaCSS 內建合理的預設值，開箱即用。安裝套件、加入建置外掛，就能開始撰寫樣式，不需要任何設定檔就能上手。

### 零執行階段成本 {#zero-runtime}

所有 CSS 轉換都發生在建置時期。你的正式環境 bundle 只會包含產生出來的 atomic CSS class，樣式處理沒有任何 JavaScript 執行階段成本。

### 從 CSS-in-JS 到 Atomic CSS {#from-css-in-js-to-atomic-css}

在 JavaScript 物件裡用熟悉的 CSS 屬性名稱撰寫樣式。PikaCSS 會把每一條宣告轉換成可重複使用的原子 class，結合 CSS-in-JS 的開發體驗與 atomic CSS 的效能優勢。詳情請見 [pika() 如何運作](#how-pika-works)。

### 解決層疊順序衝突 {#cascade-ordering-conflict-resolved}

傳統的 atomic CSS 有一個已知問題：當簡寫屬性與個別屬性（longhand）同時使用時（例如 `padding` 與 `paddingTop`），輸出順序會決定誰勝出，導致結果難以預測。PikaCSS 會自動解決這個問題，確保個別屬性一定會覆寫對應的簡寫屬性，無論你的宣告順序為何。詳情請見 [層疊順序衝突](#cascade-ordering-conflict)。

### 強大的外掛系統 {#powerful-plugin-system}

透過外掛擴充 PikaCSS，支援 CSS reset、圖示、字型、排版等功能。外掛會掛入引擎的生命週期，用來加入 preflight、shortcut、選擇器與自訂行為。

### 完全可自訂 {#fully-customizable}

設定選擇器、shortcut、變數、關鍵影格、layer、自動完成等項目。引擎的每個面向都能透過引擎設定來自訂。

## 概念 {#concept}

### pika() 如何運作 {#how-pika-works}

`pika()` 函式是核心 API。把一個或多個樣式定義物件傳給它，PikaCSS 就會在建置時期把每一次呼叫替換成產生出來的原子 class 名稱字串。

```ts
// 你寫的內容：
const className = pika({ color: 'red', fontSize: '16px' })

// 建置後變成的內容：
const className = 'pk-a pk-b'
```

每一條不重複的 CSS 宣告（`color: red`、`font-size: 16px`）都會有自己的原子 class。如果同一條宣告出現在其他地方，就會重複使用同一個 class。

::: code-group

<<< @/zh-tw/.examples/getting-started/basic.example.pikain.ts [輸入]

<<< @/zh-tw/.examples/getting-started/basic.example.pikaout.css [輸出]

:::

### 可靜態分析 {#statically-analyzable}

傳給 `pika()` 的所有引數，在建置時期都必須是可靜態分析的。這表示你不能用動態值、計算後的運算式，或執行階段的變數當作引數。PikaCSS 需要在建置步驟中擷取樣式，過程中不會執行你的程式碼。

::: warning 警告
動態值、計算後的運算式，以及執行階段的變數都不能當作 `pika()` 的引數。請使用 [ESLint 外掛](/zh-tw/getting-started/eslint-config) 及早抓出違規。若需要由執行階段狀態驅動樣式，請見 [動態樣式](/zh-tw/getting-started/dynamic-styles) 中的相關模式：variant map、CSS 變數與 shortcut。
:::

```ts
// ✅ 有效：靜態物件常值
pika({ color: 'red' })

// ✅ 有效：字串常值
pika('flex-center')

// ❌ 無效：動態變數
const color = getColor()
pika({ color })

// ❌ 無效：計算後的運算式
pika({ color: isDark ? 'white' : 'black' })

// ❌ 無效：spread 運算子
pika({ ...baseStyles })
```

### 巢狀選擇器 {#nested-selector}

PikaCSS 支援在樣式定義中使用巢狀選擇器。`$` 字元代表產生出來的原子 class 選擇器，讓你可以組合偽類（pseudo-class）、媒體查詢與自訂選擇器。

**偽類**：用 `$:` 前綴來加入偽類選擇器：

::: code-group

<<< @/zh-tw/.examples/getting-started/pseudo.example.pikain.ts [輸入]

<<< @/zh-tw/.examples/getting-started/pseudo.example.pikaout.css [輸出]

:::

**媒體查詢**：使用標準的 `@media` at-rule：

::: code-group

<<< @/zh-tw/.examples/getting-started/responsive.example.pikain.ts [輸入]

<<< @/zh-tw/.examples/getting-started/responsive.example.pikaout.css [輸出]

:::

**自訂選擇器**：使用你自己定義的選擇器名稱。這個範例需要先註冊 `@dark` 選擇器：

```ts
// pika.config.ts
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

<<< @/zh-tw/.examples/getting-started/custom-selector.example.pikain.ts [輸入]

<<< @/zh-tw/.examples/getting-started/custom-selector.example.pikaout.css [輸出]

:::

### 層疊順序衝突 {#cascade-ordering-conflict}

在傳統的 atomic CSS 中，當簡寫屬性與個別屬性衝突時，class 在樣式表裡產生的順序會決定哪個屬性勝出。舉例來說，如果 `padding: 10px` 與 `padding-top: 20px` 同時存在，樣式表裡最後出現的那個會勝出，但這不一定符合作者的意圖。

PikaCSS 解決的方式是確保個別屬性一定會在對應的簡寫屬性之後才輸出，因此 `paddingTop: '20px'` 一定會蓋過 `padding: '10px'`，無論你當初寫的順序為何。

::: code-group

<<< @/zh-tw/.examples/getting-started/cascade.example.pikain.ts [輸入]

<<< @/zh-tw/.examples/getting-started/cascade.example.pikaout.css [輸出]

:::

## 下一步 {#next}

- [安裝與設定](/zh-tw/getting-started/setup)：安裝 PikaCSS 並設定你的建置工具。
- [使用方式](/zh-tw/getting-started/usage)：看更多使用範例。
- [比較](/zh-tw/getting-started/comparison)：PikaCSS 與 UnoCSS、Tailwind CSS、Panda CSS 以及 vanilla-extract 的關係。
