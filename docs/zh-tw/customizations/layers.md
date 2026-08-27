---
title: Layers
description: 在 PikaCSS 中，用 @layer 宣告控制 CSS 層疊順序。
relatedPackages:
  - '@pikacss/core'
relatedSources:
  - packages/core/src/engine.ts
category: customizations
order: 10
translation:
  sourceFile: docs/customizations/layers.md
  sourceCommit: 33431c15728d378cc7bd9c37fd5c3b3e86e51318
  sourceBlob: 9773044780af6408b9871daae76f6441bdacb945
---

# Layers {#layers}

PikaCSS 使用 CSS `@layer` 來建立 preflight 樣式與 utility class 之間的層疊順序。

CSS layer 讓你能明確控制層疊順序。PikaCSS 會在 CSS 輸出的最上方產生一段 `@layer` 宣告，讓 preflight 一定排在 utility 之前，而自訂 layer 可以插入在任何優先層級。

預設情況下，PikaCSS 會建立兩個 layer：`preflights`（優先度 1）與 `utilities`（優先度 10）。數字越小，在 layer 順序中就越早輸出。

## 設定 {#config}

透過引擎設定中的 `layers` 來設定 layer：

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  engine: {
  layers: {
    reset: -1, // 在 preflights 之前
    preflights: 1, // 預設
    components: 5, // 介於 preflights 與 utilities 之間
    utilities: 10, // 預設
  },
  },
})
```

在樣式定義中使用 `__layer` 這個 meta-property，把樣式指派到特定的 layer：

```ts
pika({
  __layer: 'components',
  display: 'flex',
  padding: '1rem',
})
```

相關的設定選項：

- `defaultPreflightsLayer`：沒有指定 layer 的 preflight 所使用的 layer（預設：`'preflights'`）。
- `defaultUtilitiesLayer`：utility 樣式的備用 layer（預設：`'utilities'`）。

## 範例 {#examples}

::: code-group

<<< @/zh-tw/.examples/customizations/layers.example.pikain.ts [輸入]

<<< @/zh-tw/.examples/customizations/layers.example.pikaout.css [輸出]

:::

## 下一步 {#next}

- [Important](/zh-tw/customizations/important)：為所有樣式加上 `!important`。
- [Preflights](/zh-tw/customizations/preflights)：在 utility 之前注入基礎 CSS。
