---
title: Unplugin
description: 透過通用的 unplugin 整合，讓 PikaCSS 搭配任何打包工具使用。
relatedPackages:
  - '@pikacss/unplugin-pikacss'
relatedSources:
  - packages/unplugin/src/index.ts
  - packages/unplugin/src/types.ts
category: integrations
order: 10
translation:
  sourceFile: docs/integrations/unplugin.md
  sourceCommit: dbf5bd0a270b512f5d0bdb31e02cd0494dd59ec2
  sourceBlob: b10729a24403afdd74d4af00d32fdb4a6f8989f2
---

# Unplugin {#unplugin}

PikaCSS 使用 [unplugin](https://github.com/unjs/unplugin) 提供單一的建置外掛，可在所有主流打包工具（bundler）上運作。

Vite 進入點只支援 Vite 7 與 8。

## 支援的工具 {#supported-tools}

| 打包工具 | 匯入路徑 |
|---------|-------------|
| Vite | `@pikacss/unplugin-pikacss/vite` |
| Webpack | `@pikacss/unplugin-pikacss/webpack` |
| Rspack | `@pikacss/unplugin-pikacss/rspack` |
| esbuild | `@pikacss/unplugin-pikacss/esbuild` |
| Rollup | `@pikacss/unplugin-pikacss/rollup` |
| Rolldown | `@pikacss/unplugin-pikacss/rolldown` |

以 Vite 為例：

```ts
// vite.config.ts
import PikaCSS from '@pikacss/unplugin-pikacss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    PikaCSS({
      // 選項
    }),
  ],
})
```

::: tip Vite 外掛順序
Vite 進入點會以 `enforce: 'pre'` 註冊。即使你的 Vite `plugins` 陣列排成 `[vue(), pikacss()]`，PikaCSS 仍會在框架的編譯器外掛之前執行，所以你不需要為了避免樣板編譯錯誤而重新排列陣列。
:::

## 設定 {#config}

| 屬性 | 說明 |
|---|---|
| cwd | 用於路徑解析的明確工作目錄。會覆寫打包工具偵測到的專案根目錄。 |
| scan | 控制哪些原始碼檔案會被掃描以尋找 `pika()` 呼叫位置的檔案 glob 模式。未設定 `scan.include` 時，預設涵蓋 `**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,vue}`；預設的 `exclude` 會略過 `node_modules`、`dist`、`.git`、`.nuxt`、`.output`，以及 `coverage`。 |
| config | PikaCSS 引擎設定，可以是行內物件，或指向設定模組的路徑。省略時，只會在專案根目錄中探索設定檔（候選為 `pika.config.*`，接著是 `pikacss.config.*`，TS 變體優先）。 |
| autoCreateConfig | 設為 `true` 時，若找不到設定檔就會自動建立一個 `pika.config.js`。預設為 `false`：建置外掛不應該把檔案寫進你的儲存庫，請自行建立設定檔，或主動啟用。 |
| fnName | 掃描器在擷取呼叫位置時尋找的函式識別名稱。預設為 `'pika'`。 |
| transformedFormat | 轉換後 `pika()` 呼叫的輸出形態：`'string'` 或 `'array'`。 |
| tsCodegen | 控制 TypeScript 型別定義的 codegen。 |
| report | 在正式版建置結束時輸出 design token 使用報告。`true` 會記錄一份摘要；`{ output }` 則會另外把完整報告寫成 JSON。 |

> 完整的型別簽章與預設值請見 [API 參考 — Unplugin](/api/unplugin)。

## 診斷與報告 {#diagnostics-and-reporting}

引擎外掛可以在轉換期間回報診斷（例如 [`@pikacss/plugin-design-tokens`](/zh-tw/official-plugins/design-tokens#strict-mode) 的嚴格模式）。引擎絕不會拋出它們，而是把每一個 `Diagnostic`（`{ level, code, message, plugin?, … }`）交給一個處理器。unplugin 會為你安裝這個處理器；沒有 `onDiagnostic` 這個外掛選項可以設定。

### 診斷如何呈現 {#how-diagnostics-surface}

內建的處理器會即時記錄**每一個**診斷，因此 `'warning'` 會在開發與建置時立即出現。它也會收集 `'error'` 等級的診斷，並在每個模組都轉換完成後，於 `buildEnd` 時拋出單一彙整後的 `Error` 把它們全部列出，因此 error 嚴重性的診斷會**使正式版建置失敗**。

::: info 為什麼建置是在 `buildEnd` 失敗，而不是就地失敗
核心會透過一個「拋出會被吞掉」的處理器來傳遞診斷，因此處理器無法中止單一模組的轉換。所以錯誤會被彙整起來，並在 `buildEnd` 時一次拋出。取捨在於：錯誤會在整個建置之後才浮現，而不是就地出現在產生它的模組上（帶著 Vite 的開發覆蓋層）。警告仍然會即時記錄在產生它的模組上。
:::

### `report` {#report}

`report` 會在正式版建置結束時輸出 design token 使用報告。它需要註冊 `@pikacss/plugin-design-tokens`，否則不會有任何作用。`true` 會記錄一份簡潔摘要（token 總數、使用中／未使用數量、使用中的已棄用 token，以及嚴格模式違規次數），每次建置一次。傳入 `{ output }` 則會另外把完整報告以 JSON 寫到該路徑，並相對於專案根目錄解析。報告只會在建置模式下輸出，因此開發伺服器不會在每次 HMR 更新時被洗版：

```ts
PikaCSS({
  report: { output: './design-tokens.report.json' },
})
```

:::tip Nuxt
Nuxt 模組會鏡射 unplugin 的選項，因此 `report` 在 Nuxt 專案中的運作方式相同。請見 [Nuxt](/zh-tw/integrations/nuxt)。
:::

## TypeScript 與 `import 'pika.css'` {#typescript-and-import-pika-css}

在 Vite 專案中，`vite/client` 提供的環境 `*.css` 模組宣告已涵蓋 `pika.css` 這個 specifier。PikaCSS 本身沒有為它提供環境宣告，所以在其他打包工具（webpack、Rspack、esbuild）上的 TypeScript 專案可能會回報 `TS2307: Cannot find module 'pika.css'`。請在你的 TypeScript program 中的任何 `.d.ts` 檔案加上兩行 shim：

```ts
// pika-css.d.ts
declare module 'pika.css'
```

## 下一步 {#next}

- [Nuxt](/zh-tw/integrations/nuxt)：零設定的 Nuxt 整合。
- [安裝與設定](/zh-tw/getting-started/setup)：基本的專案設定。
