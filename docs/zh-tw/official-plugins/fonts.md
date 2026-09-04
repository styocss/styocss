---
title: 字型
description: 使用 fonts 外掛，透過 provider 抽象層管理網頁字型的載入。
relatedPackages:
  - '@pikacss/plugin-fonts'
relatedSources:
  - packages/plugin-fonts/src/index.ts
  - packages/plugin-fonts/src/providers.ts
  - packages/plugin-fonts/src/unifont-resolver.ts
category: official-plugins
order: 40
translation:
  sourceFile: docs/official-plugins/fonts.md
  sourceCommit: 3a4fcb62f4086da366f8eb87db50f9e3a99b912d
  sourceBlob: 470d35fd0badbd0b5fb416ac049ff9abed12851e
---

# 字型 {#fonts}

透過 provider 抽象層管理網頁字型的載入。

fonts 外掛會透過可設定的 provider 處理網頁字型載入。Google Fonts（`'google'`）、Bunny Fonts（`'bunny'`）與 Fontshare（`'fontshare'`）會在建置時期透過 `unifont` 解析，並輸出成具體的 `@font-face` 規則。Coollabs（`'coollabs'`）與自訂 provider 保留樣式表 `@import` 路徑，而 `'none'` 不會執行任何載入。每個設定的 token 也都會取得一個 `font-<token>` shortcut。

::: warning 建置時期的 provider 存取
解析 Google、Bunny 或 Fontshare 時，引擎初始化期間必須能存取 provider 網路。`unifont` 無法解析的項目會改用既有 provider 樣式表 import，而不是讓建置失敗。Provider 初始化或解析過程拋出例外時，還會發出 `fonts-provider-resolution-failed` 警告；若只是得到空的解析結果，則會靜默 fallback。
:::

::: code-group

```sh [pnpm]
pnpm add -D @pikacss/plugin-fonts
```

```sh [npm]
npm install -D @pikacss/plugin-fonts
```

```sh [yarn]
yarn add -D @pikacss/plugin-fonts
```

:::

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'
import { fonts } from '@pikacss/plugin-fonts'

export default defineConfig({
  engine: {
  plugins: [fonts()],
  fonts: {
    provider: 'google',
    fonts: {
      // 簡寫字串：'Name' 或 'Name:weight1,weight2'
      sans: 'Inter:400,500,600,700',
      // 物件形式，用於斜體或針對個別字型覆寫 provider
      mono: { name: 'Fira Code', weights: [400, 500], provider: 'bunny' },
    },
  },
  },
})
```

`fonts`（以及 `families`）底下的每個 key 都是一個 token：外掛會註冊一個 `--pk-font-<token>` CSS 變數來保存解析後的 font-family stack，以及一個套用它的 `font-<token>` shortcut。在你的樣式中使用這個 shortcut：

```ts
// 會展開成 { fontFamily: 'var(--pk-font-sans)' }
pika('font-sans')

// 或與其他樣式結合
pika('font-mono', { fontSize: '14px' })
```

`fonts` 底下命名為 `sans`、`serif` 或 `mono` 的 token 會自動取得合理的備用 stack（例如 `sans` 會退回到 `ui-sans-serif, system-ui, sans-serif`）。

## 設定 {#config}

| 屬性 | 說明 |
|---|---|
| provider | 未指定自己 provider 的項目所使用的預設字型 provider。內建可選值：`'google'`、`'bunny'`、`'fontshare'`、`'coollabs'`、`'none'`。預設值：`'google'`。 |
| fonts | 依 shortcut token 分組的字型家族。每個項目是 `'Name'` / `'Name:400,700'` 簡寫字串，或一個 `{ name, weights, italic, provider, providerOptions }` 物件；項目會透過各自的 provider 載入。 |
| families | 依 shortcut token 分組的原始 `font-family` CSS stack。不會執行任何 provider 載入；請把它用在已經可用的字型上。 |
| imports | 額外的樣式表 URL，每一個都會包在 `@import url("...")` 規則裡，並注入在既有／自訂 provider 的 import 之前。 |
| faces | 給自架或自訂字型使用的明確 `@font-face` 規則定義。 |
| display | 套用到解析後 `@font-face` 規則與既有 provider import 的 `font-display` 值。預設值：`'swap'`。 |
| providers | 用 `defineFontsProvider()` 建立的自訂字型 provider 定義，以 provider 名稱作為 key。 |
| providerOptions | 各 provider 的設定選項，以 provider 名稱作為 key。Google 的 `text` 會對應到 `unifont` 的 glyph subsetting；Bunny／Fontshare 的 `text` 請求則保留既有樣式表路徑。 |

> 完整的型別簽章與預設值請見 [API 參考 — Plugin Fonts](/api/plugin-fonts)。

## 下一步 {#next}

- [Reset](/zh-tw/official-plugins/reset)：CSS reset 樣式表。
- [排版](/zh-tw/official-plugins/typography)：語意化的長文排版。
