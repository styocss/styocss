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
  sourceCommit: 33431c15728d378cc7bd9c37fd5c3b3e86e51318
  sourceBlob: ff61183ee5472ba69de11b70010451f70268daa9
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
當你使用 `@pikacss/nuxt-pikacss` 時，不要又在 `vite.config.ts` 裡手動註冊 `@pikacss/unplugin-pikacss/vite`。Nuxt 模組已經負責 Vite adapter；single-entry authoring 時也會負責唯一 CSS module 的自動匯入。
:::

## 這個模組會做什麼 {#what-the-module-does}

### 註冊 Vite 外掛 {#vite-plugin-registration}

這個模組會自動以 `enforce: 'pre'` 註冊 `@pikacss/unplugin-pikacss/vite`，確保樣式擷取會在其他轉換之前執行。

### CSS 自動匯入 {#css-auto-import}

使用 **single-entry authoring** 時，模組會讀取 canonical project shape，產生 Nuxt plugin template，並匯入該 entry 所設定的 `cssModule`；預設 single-entry module 為 `pika.css`。

使用 **explicit multi-entry authoring** 時，模組不會猜測哪個 stylesheet 應成為全域 CSS，因此不會自動匯入任何 CSS module；即使 explicit array 當下只有一個 entry 也一樣。請由應用程式明確匯入所需的 CSS modules。

## CLI 與 prepare lifecycle {#cli-and-preparation}

直接安裝 `@pikacss/nuxt-pikacss` 也會提供自己的 `pikacss` 執行檔：

```bash
pikacss init [--cwd <dir>]
pikacss prepare [--cwd <dir>] [--config <file>]
```

Nuxt package 自己的 `pikacss prepare` 會直接以 `@pikacss/nuxt-pikacss` 作為 public-entry identity，呼叫共用的 PikaCSS generated-state preparation。它只代表 **PikaCSS generated state 準備**，不會 redirect 到 `nuxt prepare`。

`nuxt prepare` 仍是較完整的 Nuxt framework preparation lifecycle。模組會註冊 `prepare:types` hook，呼叫同一個 shared PikaCSS preparation operation，產生 canonical declaration，並把該 declaration reference 加入 Nuxt 的 app、node、shared TypeScript contexts。一般 `nuxt dev` 與 `nuxt build` 啟動時也會使用 Nuxt 的 type lifecycle，因此使用者不需要再額外執行一次 PikaCSS-specific prepare。兩個 CLI 命令仍不是 alias。

## 設定 {#config}

Nuxt module 刻意只公開 project config selector。不可變的 project root 由 Nuxt 的 `nuxt.options.rootDir` 提供；project semantics 應留在 canonical PikaCSS config，不在 module options 重複定義。

| 屬性 | 型別 | 說明 |
|---|---|---|
| `config` | `string?` | 可選的明確 PikaCSS config 檔案。相對路徑以 Nuxt project root 解析；省略時使用 canonical project-root discovery。 |

Nuxt-level surface 不提供 `cwd`、scan、function-name、Typegen、generated-state 或 report 選項；這些 project semantics 應在 canonical PikaCSS config 中設定。

## 下一步 {#next}

- [Unplugin](/zh-tw/integrations/unplugin)：搭配其他打包工具使用 PikaCSS。
- [安裝與設定](/zh-tw/getting-started/setup)：基本的專案設定。
