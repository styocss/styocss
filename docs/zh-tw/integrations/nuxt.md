---
title: Nuxt
description: 為 Nuxt 應用程式提供的零設定 PikaCSS 整合。
relatedPackages:
  - '@pikacss/nuxt-pikacss'
relatedSources:
  - packages/nuxt/src/index.ts
category: integrations
order: 20
translation:
  sourceFile: docs/integrations/nuxt.md
  sourceCommit: 36ab046b5f27060274a79d160c9b43606652d780
  sourceBlob: 4d2e52e85a7475f3c8eb28a441b32b29860721e6
---

# Nuxt {#nuxt}

PikaCSS 的 Nuxt 模組為 Nuxt 應用程式提供零設定整合。

::: code-group

```sh [pnpm]
pnpm add -D @pikacss/nuxt-pikacss
```

```sh [npm]
npm install -D @pikacss/nuxt-pikacss
```

```sh [yarn]
yarn add -D @pikacss/nuxt-pikacss
```

:::

把模組加入 `nuxt.config.ts`：

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@pikacss/nuxt-pikacss'],
  pikacss: {
    // 選項
  },
})
```

::: warning 警告
當你使用 `@pikacss/nuxt-pikacss` 時，不要又在 `vite.config.ts` 裡手動註冊 `@pikacss/unplugin-pikacss/vite`。Nuxt 模組已經接上了 Vite 外掛，並產生一個會匯入 `pika.css` 的 Nuxt 外掛範本。
:::

## 這個模組會做什麼 {#what-the-module-does}

### 註冊 Vite 外掛 {#vite-plugin-registration}

這個模組會自動以 `enforce: 'pre'` 註冊 `@pikacss/unplugin-pikacss/vite`，確保樣式擷取會在其他轉換之前執行。

### CSS 自動匯入 {#css-auto-import}

這個模組會產生一個會匯入 `pika.css` 的 Nuxt 外掛範本，所以你不需要自己手動匯入產生出來的 CSS 檔案。

### 預設掃描模式 {#default-scan-patterns}

這個模組繼承了 unplugin 的預設掃描模式：`**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,vue}`，並排除 `node_modules`、`dist`、`.git`、`.nuxt`、`.output`，以及 `coverage`。若要自訂檔案模式，請設定 `scan` 選項。

## 設定 {#config}

Nuxt 模組接受所有 [Unplugin 選項](/zh-tw/integrations/unplugin#config)，除了 `currentPackageName`（由模組自行提供），並會自動套用 Nuxt 特有的預設值。

| 屬性 | 說明 |
|---|---|
| cwd | 用於路徑解析的明確工作目錄。會覆寫打包工具偵測到的專案根目錄。 |
| scan | 控制哪些原始碼檔案會被掃描以尋找 `pika()` 呼叫位置的檔案 glob 模式。 |
| config | PikaCSS 引擎設定，可以是行內物件，或指向設定模組的路徑。 |
| autoCreateConfig | 設為 `true` 時，若找不到設定檔就會自動建立一個 `pika.config.js`。預設為 `false`。 |
| fnName | 掃描器在擷取呼叫位置時尋找的函式識別名稱。預設為 `'pika'`。 |
| transformedFormat | 轉換後 `pika()` 呼叫的輸出形態：`'string'` 或 `'array'`。 |
| tsCodegen | 控制 TypeScript 型別定義的 codegen。 |

> 完整的型別簽章與預設值請見 [API 參考 — Nuxt](/api/nuxt)。

## 下一步 {#next}

- [Unplugin](/zh-tw/integrations/unplugin)：搭配其他打包工具使用 PikaCSS。
- [安裝與設定](/zh-tw/getting-started/setup)：基本的專案設定。
