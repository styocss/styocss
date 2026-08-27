---
title: 安裝與設定
description: 安裝 PikaCSS、設定支援的建置 adapter，並準備產生的 authoring state。
relatedPackages:
  - '@pikacss/unplugin-pikacss'
relatedSources:
  - packages/unplugin/src/types.ts
  - packages/unplugin/src/cli.ts
  - packages/integration/src/operations.ts
  - packages/config/src/types.ts
category: getting-started
order: 20
---

# 安裝與設定 {#setup}

一般 bundler 專案只需要安裝一個公開整合套件，設定對應 adapter，並讓 TypeScript 載入 PikaCSS 產生的 authoring state。

## 安裝 {#install}

::: code-group

```sh [pnpm]
pnpm add -D @pikacss/unplugin-pikacss
```

```sh [npm]
npm install -D @pikacss/unplugin-pikacss
```

```sh [yarn]
yarn add -D @pikacss/unplugin-pikacss
```

:::

一般 bundler 使用情境不需要另外安裝 `@pikacss/core`、`@pikacss/config` 或 `@pikacss/integration`。外層套件會重新匯出它承諾提供的 authoring helpers 與型別。

PikaCSS 需要 Node.js `>=22`。Vite adapter 支援 Vite 7 與 8。

## 套用 Vite plugin {#apply-the-vite-plugin}

<<< @/.examples/getting-started/setup.vite.example.ts

公開 adapter options 刻意維持很小：`config?: string` 用來指定明確設定檔，`cwd?: string` 只在 host 沒有提供 root 時覆寫 project root。`fnName`、scan、output format 等語義都屬於 `pika.config.*`，不屬於 bundler options。

完整支援矩陣見 [Bundler 整合](/zh-tw/integrations/unplugin)。

::: info `pika` 是編譯時期 global，不要 import
建置整合會在編譯時取代設定好的 Pika call。`.pikacss/` 內產生的 TypeScript 宣告會提供 global callable 與 project-derived authoring surface。
:::

## 匯入 logical CSS module {#import-the-logical-css-module}

<<< @/.examples/getting-started/setup.main.example.ts

`pika.css` 是預設的 logical CSS module。Adapter 會把它解析到目前 active generation 的 private runtime CSS。若設定了其他 `cssModule`，請匯入那個 logical module。

## 建立 project config {#create-project-config}

沒有設定檔也是合法狀態，等同預設 single-entry project。要明確建立 canonical config，可執行：

```sh
pikacss init
```

`init` 採保守策略：只有需要時才建立合適的 `pika.config.*`，並輸出 generated-state / type-project 接線建議，不會偷偷修改其他專案檔案。

基本設定如下：

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  engine: {
    // EngineConfig 放在這裡
  },
})
```

自動探索只檢查 project root 的四個候選：

- `pika.config.ts`
- `pika.config.mts`
- `pika.config.js`
- `pika.config.mjs`

找不到任何候選是合法的；同時存在多個則是錯誤。Adapter/CLI 的明確 `config` path 會改走 closed explicit selection，不再做 auto-discovery。

設定檔內相對的 filesystem path，例如 `scan`、`stateDir` 與 report output，都以選中的 config file 所在目錄為基準。

## Generated state {#generated-state}

PikaCSS 擁有一個完整 generated-state root，預設為：

```text
.pikacss/
├── pika.gen.ts
├── previews/
└── runs/
```

`pika.gen.ts` 永遠屬於 generated state，沒有單獨停用或改位置的選項。若需要搬移，請在 `defineConfig()` 改整個 `stateDir`。

一般 TypeScript 專案需要讓 generated declaration進入 TypeScript program，例如：

```json
{
  "include": ["src", ".pikacss/pika.gen.ts"]
}
```

或在已被 include 的 source 目錄放一個自己管理的 declaration：

```ts
/// <reference path="../.pikacss/pika.gen.ts" />
```

在 editor、typecheck、ESLint 等獨立流程需要 generated authoring state 前，先執行：

```sh
pikacss prepare
```

自訂設定檔則可用：

```sh
pikacss prepare --config ./config/pika.config.ts
```

`prepare` 會使用與 bundler 相同的 canonical config derivation，產生 Typegen 與 preview state，但不掃描 application usages，也不產生 production report。

Nuxt 等 framework integration可自行接管這段 type preparation wiring。

## Generated state 要不要 commit？ {#commit-or-ignore-generated-state}

Generated state 可重建，通常直接 ignore：

```txt
# .gitignore
.pikacss/
```

若 CI 在 build 前就會跑 type-aware tooling，先執行 `pikacss prepare`。`pika.config.*` 本身是你的專案設定，應納入版本控制。

## 下一步 {#next}

- [使用方式](/zh-tw/getting-started/usage)
- [Engine Config](/zh-tw/getting-started/engine-config)
- [ESLint Config](/zh-tw/getting-started/eslint-config)
