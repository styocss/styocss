---
title: Preflights
description: 在 PikaCSS 中，於 utility class 之前注入基礎 CSS 樣式。
relatedPackages:
  - '@pikacss/core'
relatedSources:
  - packages/core/src/engine.ts
  - packages/core/src/types/public.ts
category: customizations
order: 30
translation:
  sourceFile: docs/customizations/preflights.md
  sourceCommit: 36ab046b5f27060274a79d160c9b43606652d780
  sourceBlob: a338b0d39f56ea6e796dfecfe416de3c9d1a93d9
---

# Preflights {#preflights}

注入會排在 utility class 之前的基礎樣式。

preflight 是注入在產生出來的樣式表最上方的 CSS 規則，預設放在 `preflights` layer 裡。你可以用它們來做 CSS reset、全域樣式、font-face 宣告，或任何應該出現在原子 utility class 之前的 CSS。

一筆 preflight 項目可以是：

- 一段原始的 CSS 字串
- 一個結構化的定義物件（鍵值對形式的 CSS 屬性）
- 一個回傳 CSS 文字或定義物件的函式 `(engine, isFormatted, ctx) => ...`（同步或非同步）

## 設定 {#config}

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  engine: {
  // 下面 `layer: 'base'` 的 preflight 需要這個
  layers: { base: 0 },

  preflights: [
    // 原始的 CSS 字串
    '*, *::before, *::after { box-sizing: border-box; }',

    // 結構化的定義
    {
      body: {
        margin: '0',
        fontFamily: 'system-ui, sans-serif',
      },
    },

    // 指定 layer
    {
      layer: 'base',
      preflight: 'html { line-height: 1.5; }',
    },

    // 非同步工廠函式
    async (engine, isFormatted, ctx) => {
      return '/* dynamic preflight */'
    },
  ],
  },
})
```

::: warning 分層的 preflight 需要先註冊 layer
用 `layer` 包起來的 preflight，必須把那個 layer 註冊到 `config.layers` 裡（上面的範例把 `base` 註冊在順序 `0`，也就是在預設的 `preflights: 1` 與 `utilities: 10` 之前）。未註冊的 layer 不會被列入產生出來的 `@layer` 順序宣告，而根據 CSS `@layer` 的語意，它接著會被排在所有已宣告 layer 的*後面*，於是基礎樣式就會覆寫你的 utility。
:::

preflight 函式在一次 `renderPreflights` 過程中會收到第三個引數 `ctx`。如果某個 preflight 會呼叫其他 preflight，就必須把它轉傳給 `engine.invokePreflight(fn, isFormatted, ctx)`，這樣每個 preflight 函式在每一次 render 過程中才會剛好只執行一次。

## 範例 {#examples}

<<< @/zh-tw/.examples/customizations/preflights.example.ts

## 下一步 {#next}

- [變數](/zh-tw/customizations/variables)：定義 CSS 自訂屬性。
- [Layers](/zh-tw/customizations/layers)：控制 preflight 的 layer 順序。
