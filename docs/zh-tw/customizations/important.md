---
title: Important
description: 讓所有產生出來的 atomic CSS 宣告都使用 !important。
relatedPackages:
  - '@pikacss/core'
relatedSources:
  - packages/core/src/plugins/important.ts
category: customizations
order: 20
translation:
  sourceFile: docs/customizations/important.md
  sourceCommit: 33431c15728d378cc7bd9c37fd5c3b3e86e51318
  sourceBlob: 867c3460991a40e22bf24a43fe521da6c74a5731
---

# Important {#important}

強制讓所有產生出來的 atomic CSS 宣告都包含 `!important`。

當你要把 PikaCSS 整合進一個帶有高 specificity 樣式的既有專案時，你可能會需要讓所有產生出來的原子 class 都在層疊中勝出。設定 `important: { default: true }` 會為每一個產生出來的 CSS 值加上 `!important`。

## 設定 {#config}

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  engine: {
  important: { default: true },
  },
})
```

## 針對個別定義的覆寫 {#per-definition-override}

每一筆樣式定義都可以用 `__important` 旗標覆寫設定好的預設值：

- `__important: false` 會在 `important.default` 為 `true` 時，讓某筆定義退出。
- `__important: true` 會在預設值為 `false`（或未設定）時，讓某筆定義加入。

```ts
// 在 `important: { default: true }` 之下，這筆定義輸出時不帶 `!important`
pika({
  __important: false,
  color: 'blue',
})

// 使用預設設定時，只有這筆定義輸出時會帶 `!important`
pika({
  __important: true,
  color: 'red',
})
```

明確設定的 `__important` 旗標也會傳遞到巢狀選擇器區塊中，而這些區塊可以用自己明確設定的旗標覆寫它。

## 範例 {#examples}

::: code-group

<<< @/zh-tw/.examples/customizations/important.example.pikain.ts [輸入]

<<< @/zh-tw/.examples/customizations/important.example.pikaout.css [輸出]

:::

## 下一步 {#next}

- [Preflights](/zh-tw/customizations/preflights)：在 utility 之前注入基礎 CSS。
- [Layers](/zh-tw/customizations/layers)：控制層疊順序。
