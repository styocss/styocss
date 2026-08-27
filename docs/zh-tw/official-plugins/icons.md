---
title: 圖示
description: 使用 icons 外掛，透過 Iconify 解析圖示 shortcut class。
relatedPackages:
  - '@pikacss/plugin-icons'
relatedSources:
  - packages/plugin-icons/src/index.ts
category: official-plugins
order: 30
translation:
  sourceFile: docs/official-plugins/icons.md
  sourceCommit: fa59b7ee866216c41311b61f507335d67b58c16c
  sourceBlob: 5efef59010a735b928d991ae03ff23a4a04079f5
---

# 圖示 {#icons}

透過 Iconify 整合，把圖示 shortcut class 解析成 CSS。

icons 外掛會把像 `i-mdi:home` 這樣的 shortcut pattern 解析成 CSS 宣告，並用 `mask-image` 或 `background-image` 顯示圖示。圖示會依序從三個來源載入：自訂 collection、本機安裝的 `@iconify-json/*` 套件，以及選用的 CDN 備用來源。

::: code-group

```sh [pnpm]
pnpm add -D @pikacss/plugin-icons
```

```sh [npm]
npm install -D @pikacss/plugin-icons
```

```sh [yarn]
yarn add -D @pikacss/plugin-icons
```

:::

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'
import { icons } from '@pikacss/plugin-icons'

export default defineConfig({
  engine: {
  plugins: [icons()],
  icons: {
    prefix: 'i-',
    mode: 'auto',
  },
  },
})
```

使用方式：

```ts
// 使用一個圖示
pika('i-mdi:home')

// 強制使用 mask 模式（可用 currentColor 上色）
pika('i-mdi:home?mask')

// 強制使用 background 模式
pika('i-mdi:home?bg')
```

視需要安裝圖示 collection：

::: code-group

```sh [pnpm]
pnpm add -D @iconify-json/mdi
```

```sh [npm]
npm install -D @iconify-json/mdi
```

```sh [yarn]
yarn add -D @iconify-json/mdi
```

:::

## 設定 {#config}

| 屬性 | 說明 |
|---|---|
| prefix | 觸發圖示解析的 shortcut 前綴，例如 `'i-'`。 |
| mode | CSS 呈現技術：`'mask'`（可透過 `currentColor` 上色）、`'bg'`（background-image），或 `'auto'`。 |
| scale | 套用到圖示 SVG 的縮放係數。會與 `unit` 結合以決定最終尺寸。 |
| collections | 自訂圖示 collection，會在本機或 CDN 來源之前解析。用 `defineWatchableIconCollection` 包裝項目可加入相依監看。 |
| customizations | 載入圖示時套用的 Iconify SVG 自訂設定。 |
| autoInstall | 設為 `true` 時，會在第一次使用時自動安裝缺少的 `@iconify-json/*` 套件。 |
| cwd | 解析本機安裝的圖示套件時使用的工作目錄。 |
| cdn | 作為備用來源、用來抓取遠端圖示 collection 的 CDN URL 範本。 |
| unit | 附加到圖示尺寸的 CSS 單位，例如 `'em'`。 |
| extraProperties | 注入到每個圖示樣式宣告中的額外 CSS 屬性。 |
| processor | 在圖示 CSS 樣式項目建置完成後呼叫的後處理 hook。 |
| autocomplete | 要加入 IDE 自動完成建議中的額外圖示名稱。 |

> 完整的型別簽章與預設值請見 [API 參考 — Plugin Icons](/api/plugin-icons)。

## 可監看的自訂 collection {#watchable-custom-collections}

一般的 `collections` 項目對 PikaCSS 是不透明的：任意 loader 可能讀取任何檔案，因此 PikaCSS 無法推導完整 watch set。用 `defineWatchableIconCollection` 包裝項目，可以明確宣告檔案系統相依。Collection-wide 路徑會在 Engine initialization 時註冊。逐圖示 dependency function 仍會在 icon loader 執行前解析路徑，但只有 PikaCSS 能在初始化階段透過 authoritative enumerable catalog 知道的 concrete members，才會把這些路徑納入 Engine dependencies；opaque request-only loader 不會重新打開 finalized dependency state。相對路徑從 bundler 的專案根目錄解析：

```ts
import { defineWatchableIconCollection, icons } from '@pikacss/plugin-icons/node'

export default defineConfig({
  engine: {
  plugins: [icons()],
  icons: {
    collections: {
      app: defineWatchableIconCollection({
        source: async (name, { dependencies: [file] }) => loadSvgYourWay(file),
        dependencies: ({ name }) => `./icons/${name}.svg`,
      }),
    },
  },
  },
})
```

`dependencies` 接受單一路徑或陣列（collection-wide，於 Engine initialization 時註冊），或 `{ collection, name }` 的函式（逐圖示）。函式形式只有在 PikaCSS 同時擁有 authoritative enumerable catalog、能在初始化階段列舉 concrete members 時，才是完整可監看的。針對常見的一圖示一檔案目錄結構，`/node` 進入點提供現成 helper：它會在初始化時列舉目錄、註冊 direct directory-membership 與已知 member-file dependencies，將 `i-app:home` 解析為 `<projectRoot>/icons/home.svg`，並在每次解析時重新讀取內容。因此建立／刪除／重新命名或內容／存在性變更，都會透過 initialization-time dependency lifecycle 重新 derive generation：

```ts
import { fileSystemIconCollection, icons } from '@pikacss/plugin-icons/node'

export default defineConfig({
  engine: {
  plugins: [icons()],
  icons: {
    collections: {
      app: fileSystemIconCollection({ dir: './icons' }),
    },
  },
  },
})
```

取捨：未包裝的一般 collection 仍完全支援但無法被監看；你自己 loader 內部捕捉的私有快取不在 PikaCSS 的失效保證範圍內。

## processor 中繼資料 {#processor-metadata}

`processor` 會收到可變更的已產生樣式項目，以及描述解析結果的中繼資料：

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'
import { icons } from '@pikacss/plugin-icons'

export default defineConfig({
  engine: {
  plugins: [icons()],
  icons: {
    processor(styleItem, meta) {
      // meta.collection：解析後的 Iconify collection
      // meta.name：解析後的圖示名稱
      // meta.svg：載入的 SVG 內容
      // meta.source：'custom' | 'local' | 'cdn'
      // meta.mode：解析 'auto' 後最終採用的 'mask' 或 'bg'
    },
  },
  },
})
```

回呼函式可以直接修改 `styleItem`，在 shortcut 結果回傳前加入或取代 CSS 宣告。

## 載入與重試行為 {#loading-and-retry-behavior}

解析時會依序檢查自訂 collection、本機安裝套件，再檢查設定的 CDN。找不到或暫時無法載入的圖示會輸出警告，但不會被永久快取成失敗結果；後續再次解析時會重新嘗試載入，而失敗的 CDN 請求也會先從 collection 快取移除。

一般（未包裝）的自訂 collection 值是 Iconify loader 函式或 inline SVG 對照表：PikaCSS 無法得知其背後檔案路徑，也不會把這些檔案註冊為設定相依項目，因此修改這些檔案不會自動觸發設定重新載入 — 請重新啟動開發程序，或在修改後觸碰一次 PikaCSS 設定檔。若要讓後備檔案可被監看，請用 `defineWatchableIconCollection` 包裝該項目（見上方的[可監看的自訂 collection](#watchable-custom-collections)）。

## 下一步 {#next}

- [字型](/zh-tw/official-plugins/fonts)：網頁字型的載入與管理。
- [Reset](/zh-tw/official-plugins/reset)：CSS reset 樣式表。
