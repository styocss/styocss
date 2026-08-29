---
title: 圖示
description: 使用 icons 外掛，透過 Iconify 解析圖示 shortcut class。
relatedPackages:
  - '@pikacss/plugin-icons'
relatedSources:
  - packages/plugin-icons/src/index.ts
  - packages/plugin-icons/src/node.ts
  - packages/plugin-icons/src/watchable.ts
category: official-plugins
order: 30
translation:
  sourceFile: docs/official-plugins/icons.md
  sourceCommit: 5ff8a61e355c9a70b088ccfae9acbf6425675cd7
  sourceBlob: 45ec0241b783db86c9d7a8c9946018bc705dd46c
---

# 圖示 {#icons}

透過 Iconify 整合，把圖示 shortcut class 解析成 CSS。

icons 外掛會把像 `i-mdi:home` 這樣的 shortcut pattern 解析成 CSS 宣告，並用 `mask-image` 或 `background-image` 顯示圖示。解析時會先檢查自訂 collection，再檢查目前啟用的本機 loader capability，最後才使用選用的 CDN 備用來源。

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

Bundler 設定通常會在 Node.js 中執行。若要使用 PikaCSS 內建的 loader 解析已安裝的 `@iconify-json/*` 套件，或使用 `autoInstall`，請使用 `/node` 進入點。Package root 的 `icons()` factory 維持 platform-neutral，適用於自訂 collection 與已設定的 CDN；自訂 host 也可以用 `createIconsPlugin(runtime)` 注入自己的 runtime capability。

下方設定範例會使用 `mdi` collection，請先安裝：

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

<<< @/.examples/official-plugins/icons.setup.example.ts

使用方式：

```ts
// 使用已安裝 @iconify-json/mdi collection 中的圖示
pika('i-mdi:home')

// 強制使用 mask 模式（可用 currentColor 上色）
pika('i-mdi:home?mask')

// 強制使用 background 模式
pika('i-mdi:home?bg')
```

## 設定 {#config}

| 屬性 | 說明 |
|---|---|
| prefix | 觸發圖示解析的 shortcut 前綴，例如 `'i-'`。 |
| mode | CSS 呈現技術：`'mask'`（可透過 `currentColor` 上色）、`'bg'`（background-image），或 `'auto'`。 |
| scale | 未設定 `unit` 時，會傳給 Iconify，用來縮放它從來源解析出的尺寸。對 Iconify JSON collection 而言，若沒有可用尺寸，也包含 Iconify 的 `1em` 備用值。設定 `unit` 時，會提供 `${scale}${unit}` 中的數值部分。 |
| collections | 自訂圖示 collection，會在本機 loader 或 CDN 來源之前解析。`defineWatchableIconCollection` 可註冊 collection-wide dependency，以及 Engine initialization 時可列舉成員的 per-icon dependency。 |
| customizations | 載入圖示時套用的 Iconify SVG 自訂設定。外掛的 `unit` 填入邏輯會在 `iconCustomizer` 中執行，早於 Iconify 套用 `customizations.additionalProps`；之後會將 `extraProperties` 合併到這些額外屬性。 |
| autoInstall | 啟用時，內建 Node loader 可視需要安裝缺少的 `@iconify-json/*` 套件。設定 `cwd: string[]` 時，會依序搜尋根目錄，且內建 Iconify node loader 只會針對最後一個根目錄嘗試自動安裝。請使用 `/node`；當 `process.env.ESLINT` 有設定時，會略過本機載入。 |
| cwd | 本機 loader 的 `string \| string[]` 搜尋根目錄。陣列項目會依序搜尋；內建 node loader 只會針對最後一個項目嘗試 `autoInstall`。相對項目會從 Engine host project root 解析，省略 `cwd` 時使用該 root；獨立使用時則退回目前工作目錄。需要 `/node` 或等效的自訂 local-loader capability。 |
| cdn | 作為備用來源、用來抓取遠端圖示 collection 的 CDN URL 範本。 |
| unit | 在使用者的 `iconCustomizer` 執行後，外掛會以 `${scale}${unit}` 填入每個缺少或 falsy 的 width/height。接著 Iconify 會套用 `customizations.additionalProps`；之後合併的 `extraProperties` 會在重複鍵時優先。明確尺寸優先於來源尺寸，而單一尺寸可能讓 Iconify 根據 SVG 長寬比推導另一個尺寸。 |
| extraProperties | 傳給 Iconify 並轉送至每個產生的圖示樣式項目的額外圖示屬性。它們會覆寫 `customizations.additionalProps` 中的重複鍵，包括 width 與 height。 |
| processor | 在圖示 CSS 樣式項目建置完成後呼叫的後處理 hook。`meta.name` 是在解析期間攜帶的已剖析／要求圖示名稱，不一定是標準 catalog key 或 alias 目標。 |
| autocomplete | 額外加入 IDE 自動完成的不含設定 shortcut prefix 的明確 logical icon identifier（例如 `mdi:home`；請省略設定的 shortcut prefix）。每個項目會與所有設定的 prefix 組合。可列舉的 custom/filesystem catalog 也會提供名稱；內建 `/node` discovery 會針對每個 root 使用最近的 governing `package.json`，且只使用其中的 `dependencies`、`devDependencies` 與 `optionalDependencies`，不使用 peer dependencies 或祖先 manifest。 |

若最後沒有明確尺寸，Iconify 會使用它從來源解析出的尺寸並套用 `scale`；對 Iconify JSON collection 而言，若沒有可用尺寸，也包含其 `1em` 備用值。這項來源尺寸規則與產生 CSS 的 `background-size`/mask sizing 分開。

> 由程式產生的完整 public API 型別簽章與預設值（包含 `/node` 等公開 package subpath）請見 [API 參考 — Plugin Icons](/api/plugin-icons)。

## 可監看的自訂 collection {#watchable-custom-collections}

一般的 `collections` 項目對 PikaCSS 是不透明的：任意 loader 可能讀取任何檔案，因此 PikaCSS 無法推導完整 watch set。用 `defineWatchableIconCollection` 包裝項目，可以明確宣告檔案系統 dependency。Collection-wide 路徑會在 Engine initialization 時註冊。Per-icon dependency function 只有在 PikaCSS 能透過 authoritative enumerable catalog、於初始化階段列舉到 concrete member 時，才會成為 watch metadata。若是 opaque request-only loader，function 仍會解析路徑並傳給 loader，但 Engine dependency set finalized 之後，這些路徑**不會**再被 late-register 或監看。

`defineWatchableIconCollection` 本身是 platform-neutral。以下完整範例使用 collection-wide catalog 檔案，因此宣告的 dependency 確實會加入 watch set：

```ts
import { readFile } from 'node:fs/promises'
import { defineWatchableIconCollection, icons } from '@pikacss/plugin-icons'
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  engine: {
    plugins: [icons()],
    icons: {
      collections: {
        app: defineWatchableIconCollection({
          dependencies: './icons/app.json',
          async source(name, { dependencies: [catalogFile] }) {
            const catalog = JSON.parse(await readFile(catalogFile, 'utf8')) as Record<string, string>
            return catalog[name]
          },
        }),
      },
    },
  },
})
```

相對 dependency 路徑會從 Engine host 的有效 project root 解析。`dependencies` 可接受單一路徑或陣列（collection-wide，在初始化時註冊），或 `{ collection, name }` function（per-icon）。只有 PikaCSS 同時有 authoritative enumerable catalog、能列舉 concrete member 時，function 形式才是完整可監看的。

針對常見的一圖示一檔案目錄結構，應使用 `/node` helper，而不是 opaque request-only loader。它會在初始化時列舉目錄、註冊目錄 membership 與已知 member files，並將 `i-app:home` 對應到 `<projectRoot>/icons/home.svg`。因此建立／刪除／重新命名，或內容／存在性變更都能促使 generation 重新 derive；新的 Engine generation 會讀到最新的檔案內容：

```ts
import { fileSystemIconCollection, icons } from '@pikacss/plugin-icons/node'
import { defineConfig } from '@pikacss/unplugin-pikacss'

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

`defineWatchableIconCollection` 或 `fileSystemIconCollection` 回傳的 descriptor 是 definition identity，請**原樣**放進 `icons.collections`。不要用 object spread 複製它：spread 會把 descriptor 變成 plain object，Core 的 config clone 接著會遺失 private capability brand，使它在沒有明顯錯誤的情況下退化成一般 opaque collection。

取捨：未包裝的一般 collection 仍完全支援但無法被監看；你自己 loader 內部捕捉的私有快取不在 PikaCSS 的 invalidation guarantee 範圍內。

## processor 中繼資料 {#processor-metadata}

`processor` 會收到可變更的已產生樣式項目，以及描述解析結果的中繼資料：

```ts
import { icons } from '@pikacss/plugin-icons/node'
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  engine: {
    plugins: [icons()],
    icons: {
      processor(styleItem, meta) {
        // meta.collection：解析後的 Iconify collection
        // meta.name：剖析／要求的名稱；可能與 alias 目標不同
        // meta.svg：載入的 SVG 內容
        // meta.source：'custom' | 'local' | 'cdn'
        // meta.mode：解析 'auto' 後最終採用的 'mask' 或 'bg'
      },
    },
  },
})
```

回呼函式可以直接修改 `styleItem`，在 shortcut 結果回傳前加入或取代 CSS 宣告。`meta.name` 是從 request 剖析出的名稱，並在解析過程中持續傳遞；Iconify 的名稱正規化或 alias 比對不會把它替換成 canonical catalog key。

## 載入與重試行為 {#loading-and-retry-behavior}

解析時會先檢查自訂 collection，再檢查目前啟用的 local-loader capability，最後才檢查設定的 CDN。`/node` adapter 會提供解析已安裝 Iconify 套件的內建本機 loader；當 `process.env.ESLINT` 有設定時，這條本機載入／安裝路徑會刻意略過。自訂 collection 與 CDN 解析不受這個 guard 影響。當 loader 沒有回傳圖示時，外掛會記錄警告，但不會快取永久 miss。active local-loader capability 拒絕時，該拒絕會傳遞給其呼叫端，同時會驅逐該圖示的遭拒絕項目，讓後續解析能重試。失敗的 CDN collection 請求會視為 miss，並在下一次嘗試前從 collection 快取移除。

一般（未包裝）的自訂 collection 值是 Iconify loader function 或 inline SVG map：PikaCSS 無法得知其背後的檔案路徑，也不會把這些檔案註冊為 config dependency，因此修改這些檔案不會自動觸發 config reload — 請重新啟動開發程序，或在修改後觸碰一次 PikaCSS config。若要讓已知檔案系統輸入參與 dependency watching，請使用 `defineWatchableIconCollection`；若是 Node.js 下的一圖示一檔案目錄，則優先使用 `fileSystemIconCollection`（見上方的[可監看的自訂 collection](#watchable-custom-collections)）。

## 下一步 {#next}

- [字型](/zh-tw/official-plugins/fonts)：網頁字型的載入與管理。
- [Reset](/zh-tw/official-plugins/reset)：CSS reset 樣式表。
