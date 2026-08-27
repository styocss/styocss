---
title: API 參考
description: 所有 PikaCSS 套件 API 與匯出項目的總覽。
relatedPackages:
  - '@pikacss/core'
  - '@pikacss/config'
  - '@pikacss/integration'
  - '@pikacss/unplugin-pikacss'
  - '@pikacss/nuxt-pikacss'
  - '@pikacss/plugin-reset'
  - '@pikacss/plugin-icons'
  - '@pikacss/plugin-fonts'
  - '@pikacss/plugin-typography'
  - '@pikacss/plugin-design-tokens'
  - '@pikacss/eslint-config'
relatedSources:
  - scripts/_skill-shared/index.ts
  - AGENTS.md
category: api
order: 0
translation:
  sourceFile: docs/api/index.md
  sourceCommit: 36ab046b5f27060274a79d160c9b43606652d780
  sourceBlob: a3a28b0159f17f84edef379ddcd2f3bac15bf8de
---

# API 參考 {#api-reference}

PikaCSS 由數個套件組成，每個套件都有專注的 API。

## 套件總覽 {#package-overview}

### 核心套件 {#core-packages}

| 套件 | 用途 |
|---------|---------|
| [`@pikacss/core`](/api/core) | 引擎基礎：`createEngine`、`defineEngineConfig`、`defineEnginePlugin`、型別 |
| [`@pikacss/config`](/api/config) | Canonical project configuration：`defineConfig`、scan/report/config 型別 |
| [`@pikacss/integration`](/api/integration) | 建置系統橋接：project generation、prepare/init、原始碼轉換與 generated-state publication |
| [`@pikacss/unplugin-pikacss`](/api/unplugin) | Rollup / Webpack 家族 adapters：Vite、Rollup、Rolldown、Webpack、Rspack |
| [`@pikacss/nuxt-pikacss`](/api/nuxt) | Nuxt 模組：零設定的 Nuxt 整合 |

### 官方外掛 {#official-plugins}

| 套件 | 用途 |
|---------|---------|
| [`@pikacss/plugin-reset`](/api/plugin-reset) | CSS reset 注入 |
| [`@pikacss/plugin-icons`](/api/plugin-icons) | 透過 Iconify 的圖示 shortcut |
| [`@pikacss/plugin-fonts`](/api/plugin-fonts) | 網頁字型載入 |
| [`@pikacss/plugin-typography`](/api/plugin-typography) | 長文排版樣式 |
| [`@pikacss/plugin-design-tokens`](/api/plugin-design-tokens) | W3C design token 轉 CSS 變數 |

### 工具 {#tooling}

| 套件 | 用途 |
|---------|---------|
| [`@pikacss/eslint-config`](/api/eslint-config) | 用於靜態分析的 ESLint 規則 |

## 套件關係圖 {#package-graph}

```mermaid
graph TD
    core["@pikacss/core"]
    config["@pikacss/config"]
    integration["@pikacss/integration"]
    unplugin["@pikacss/unplugin-pikacss"]
    nuxt["@pikacss/nuxt-pikacss"]
    reset["@pikacss/plugin-reset"]
    icons["@pikacss/plugin-icons"]
    fonts["@pikacss/plugin-fonts"]
    typography["@pikacss/plugin-typography"]
    designTokens["@pikacss/plugin-design-tokens"]

    config --> core
    integration --> config
    unplugin --> integration
    nuxt --> unplugin
    reset --> core
    icons --> core
    fonts --> core
    typography --> core
    designTokens --> core
```

## 下一步 {#next}

- [Core API](/api/core)：引擎函式、define 輔助函式，以及型別。
- [快速開始](/zh-tw/getting-started/what-is-pikacss)：介紹與設定。
