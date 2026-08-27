---
title: Unplugin
description: 透過 unplugin 整合，讓 PikaCSS 搭配受支援的 Rollup 與 Webpack 家族打包工具。
relatedPackages:
  - '@pikacss/unplugin-pikacss'
relatedSources:
  - packages/unplugin/src/index.ts
  - packages/unplugin/src/types.ts
category: integrations
order: 10
translation:
  sourceFile: docs/integrations/unplugin.md
  sourceCommit: 33431c15728d378cc7bd9c37fd5c3b3e86e51318
  sourceBlob: 1a734fcda27f0061392aae1fbfb950bf8870f3fa
---

# Unplugin {#unplugin}

PikaCSS 使用 [unplugin](https://github.com/unjs/unplugin) 作為轉接層，但正式支援範圍明確限定為 Rollup 與 Webpack 兩個家族。

Vite 進入點只支援 Vite 7 與 8。

## 支援的工具 {#supported-tools}

| 家族 | 打包工具 | 匯入路徑 |
|------|---------|-------------|
| Rollup | Vite | `@pikacss/unplugin-pikacss/vite` |
| Rollup | Rollup | `@pikacss/unplugin-pikacss/rollup` |
| Rollup | Rolldown | `@pikacss/unplugin-pikacss/rolldown` |
| Webpack | Webpack | `@pikacss/unplugin-pikacss/webpack` |
| Webpack | Rspack | `@pikacss/unplugin-pikacss/rspack` |

其他 Unplugin host（包含 esbuild）不在正式支援範圍內，也不提供公開的 PikaCSS adapter 進入點。設定 bundler plugin 時請匯入上表明確列出的 subpath，而不是直接使用套件根入口。

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

Bundler adapter 只有兩個 bootstrap selector。原始碼掃描、function root、CSS module 名稱、transform format、generated-state 位置、Engine 行為與 production report 都屬於 canonical PikaCSS project config，不是 adapter options。

| 屬性 | 型別 | 說明 |
|---|---|---|
| `cwd` | `string?` | 可選的 project-root override；一般情況由正式支援的 bundler 提供 resolved root/context。 |
| `config` | `string?` | 可選的明確 PikaCSS config 檔案。相對路徑從選定的 project root 解析；省略時使用 canonical project-root discovery。 |

> 精確型別請見 [API 參考 — Unplugin](/api/unplugin)。

## 診斷與報告 {#diagnostics-and-reporting}

引擎外掛可以在轉換期間回報診斷（例如 [`@pikacss/plugin-design-tokens`](/zh-tw/official-plugins/design-tokens#strict-mode) 的嚴格模式）。引擎絕不會拋出它們，而是把每一個 `Diagnostic`（`{ level, code, message, plugin?, … }`）交給一個處理器。unplugin 會為你安裝這個處理器；沒有 `onDiagnostic` 這個外掛選項可以設定。

### 診斷如何呈現 {#how-diagnostics-surface}

內建的處理器會即時記錄**每一個**診斷，因此 `'warning'` 會在開發與建置時立即出現。它也會收集 `'error'` 等級的診斷，並在每個模組都轉換完成後，於 `buildEnd` 時拋出單一彙整後的 `Error` 把它們全部列出，因此 error 嚴重性的診斷會**使正式版建置失敗**。

::: info 為什麼建置是在 `buildEnd` 失敗，而不是就地失敗
核心會透過一個「拋出會被吞掉」的處理器來傳遞診斷，因此處理器無法中止單一模組的轉換。所以錯誤會被彙整起來，並在 `buildEnd` 時一次拋出。取捨在於：錯誤會在整個建置之後才浮現，而不是就地出現在產生它的模組上（帶著 Vite 的開發覆蓋層）。警告仍然會即時記錄在產生它的模組上。
:::

### Production report {#production-reports}

Production report 是 canonical PikaCSS project config 的 per-entry 設定，不是 bundler plugin option。`report: true` 會啟用該 entry 的最終摘要；`{ output }` 會另外把 JSON report 發布到以 config 為基準解析的路徑。

```ts
// pika.config.ts
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  report: { output: './design-tokens.report.json' },
})
```

Adapter 只負責 host lifecycle 呈現。正式支援的 Rollup-family / Webpack-family host 只會在成功的一次性 production build 後 finalize report；dev/watch 不會發布 final report。Producer、serialization、目錄建立、寫入或 atomic replacement 失敗都會讓 production build reject。

## CLI {#cli}

直接安裝 `@pikacss/unplugin-pikacss` 會提供 `pikacss` 執行檔。CLI 刻意維持精簡：

```bash
pikacss init [--cwd <dir>]
pikacss prepare [--cwd <dir>] [--config <file>]
```

`init` 只會在尚無 canonical PikaCSS config 時建立設定檔並輸出後續指引；不會修改 package metadata、TypeScript 設定或 ignore 檔。`prepare` 只執行 deterministic generated-state publication，不會掃描應用程式原始碼、建立 runtime CSS、啟動 watcher，也不會輸出最終 production report。

`--cwd` 選擇 host project root；`--config` 僅供 `prepare` 使用，語意與 bundler adapter 的 explicit closed config-file selector 相同。

## TypeScript 與 logical CSS module {#typescript-and-logical-css-modules}

在 Vite 專案中，`vite/client` 提供的 ambient `*.css` module declaration 會涵蓋 logical CSS-module specifier，例如 single-entry 預設的 `pika.css`。PikaCSS 本身不會為這些 specifier 提供 ambient declaration，因此其他 bundler（Webpack、Rspack、Rollup、Rolldown）的 TypeScript 專案可能對 configured `cssModule` 回報 `TS2307`。請替應用程式實際匯入的 logical module 加上 shim：

```ts
// pika-css.d.ts
declare module 'pika.css' // 或你設定的 logical cssModule
```

## 下一步 {#next}

- [Nuxt](/zh-tw/integrations/nuxt)：零設定的 Nuxt 整合。
- [安裝與設定](/zh-tw/getting-started/setup)：基本的專案設定。
