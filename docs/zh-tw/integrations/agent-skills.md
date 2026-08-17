---
title: Agent Skills
description: 用於使用與擴充 PikaCSS 的 AI 輔助開發 skill。
relatedPackages:
  - '@pikacss/core'
  - '@pikacss/unplugin-pikacss'
  - '@pikacss/plugin-icons'
  - '@pikacss/plugin-design-tokens'
relatedSources:
  - skills/pikacss-use/SKILL.md
  - .claude-plugin/marketplace.json
category: integrations
order: 30
translation:
  sourceFile: docs/integrations/agent-skills.md
  sourceCommit: c315de51caf6711bbfa80bfe86a4d4eb1c4cfb40
  sourceBlob: f8f1948dd330094b6cd520539de598cc5c77e395
---

# Agent Skills {#agent-skills}

PikaCSS 內建了一個 agent skill，為使用與擴充 PikaCSS 兩方面都提供 AI 輔助指引。你可以把它裝成 Claude Code 外掛，或是用 `skills` CLI 裝進其他任何支援的 coding agent。

## 安裝 {#install}

### Claude Code 外掛 {#claude-code-plugin}

在 Claude Code 中，先把這個 repository 加為 plugin marketplace，再安裝外掛：

```text
/plugin marketplace add pikacss/pikacss
/plugin install pikacss@pikacss
```

當你的工作內容符合它的描述時，Claude 會自行載入這個 skill；要明確叫用請參考[如何觸發](#how-to-trigger)。執行 `/plugin marketplace update` 會把 marketplace 更新到此 repository 預設分支上的 skill 內容，而該內容可能比最新的 npm 發布版本更新。

### Skills CLI {#skills-cli}

任何支援的 agent（包含 Claude Code）都可以改用 [`skills` CLI](https://www.npmjs.com/package/skills) 直接安裝這個 skill：

```bash
npx skills add pikacss/pikacss --skill pikacss-use
```

兩種方式安裝的都是同一份 `skills/pikacss-use` 內容。

## pikacss-use {#pikacss-use}

### 何時使用 {#when-to-use}

只要正在處理 PikaCSS，就可以使用這個 skill：

- 在新專案中設定 PikaCSS
- 設定引擎選項或建置工具整合
- 使用 `pika()` 及其變體
- 使用官方外掛（reset、icons、fonts、typography 與 design tokens）
- 排解轉換、產生檔案、TypeScript 宣告或設定重新載入問題
- 為會載入本機資源的外掛選擇中立或 Node.js 執行階段 adapter
- 從頭建立新的引擎外掛
- 實作外掛 hook、結構化 diagnostic 與生命週期行為
- 透過模組擴增來擴充 `EngineConfig`
- 註冊外部設定相依檔案，以供檔案監看
- 撰寫外掛測試

### 如何觸發 {#how-to-trigger}

當問題與 PikaCSS 的使用或外掛開發相關時，這個 skill 會自動啟用。你也可以在 prompt 中明確提到「using PikaCSS」、「PikaCSS setup」或「PikaCSS plugin development」。

以 Claude Code 外掛安裝時，這個 skill 帶有 namespace，用 `/pikacss:pikacss-use` 叫用；以 `skills` CLI 安裝時不帶 namespace，直接是 `/pikacss-use`。

### 涵蓋範圍 {#coverage}

- 安裝與建置工具整合（Vite、Webpack、Rollup、esbuild、Rspack、Rolldown 與 Nuxt）
- Node.js、Vite、來源檔案與靜態分析相容性限制
- 引擎設定與客製化
- 產生的 CSS 與 TypeScript 宣告檔案
- `pika()`、`pika.str()` 與 `pika.arr()` 函式
- 官方外掛的使用與設定
- 中立與 Node.js 外掛進入點
- ESLint 整合
- TypeScript 自動完成支援
- 外掛結構與 `defineEnginePlugin`
- 生命週期 hook、hook context、diagnostic 與執行順序
- 透過 TypeScript 模組擴增來擴充設定
- layer 管理與 preflight 注入
- selector、shortcut、變數、關鍵影格與 design token 的註冊
- 外部設定相依檔案的監看
- 使用 `createEngine` 的外掛測試模式

## 下一步 {#next}

- [安裝與設定](/zh-tw/getting-started/setup)：在你的專案中安裝 PikaCSS。
- [外掛開發](/zh-tw/plugin-development/create-a-plugin)：建立自己的外掛。
