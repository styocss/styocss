---
title: 建立外掛
description: 學習如何用 defineEnginePlugin 建立 PikaCSS 引擎外掛。
relatedPackages:
  - '@pikacss/core'
relatedSources:
  - packages/core/src/plugin.ts
  - packages/core/src/engine.ts
  - packages/plugin-reset/src/index.test.ts
category: plugin-development
order: 10
translation:
  sourceFile: docs/plugin-development/create-a-plugin.md
  sourceCommit: 16dc72d27d06160bfb9a659139220b4c08545482
  sourceBlob: 62bd4c1e6798190f8c810d09061d5f8e6889f1ff
---

# 建立外掛 {#create-a-plugin}

打造自訂的 PikaCSS 引擎外掛，為引擎擴充新功能。

## 結構 {#structure}

PikaCSS 外掛是一個回傳 `EnginePlugin` 物件的函式。建議的寫法：

<<< @/zh-tw/.examples/plugin-development/create-plugin.example.ts

## defineEnginePlugin {#defineengineplugin}

`defineEnginePlugin` 輔助函式會為外掛物件提供型別推導。它接受一個物件，包含：

- `name`：識別這個外掛的唯一字串。
- `order`：選擇性的執行順序，`'pre'`、`'post'`，或省略以使用預設值。
- Hook 方法：會在引擎生命週期的特定時機執行的函式。

上面的範例直接使用 `defineEnginePlugin()`，讓 `config` 與 `engine` hook 參數不需額外的輔助型別就能保持推導。

## order {#order}

外掛的執行順序決定一個外掛的 hook 相對於其他外掛何時執行：

| 值 | 行為 |
|-------|----------|
| `'pre'` | 在預設順序的外掛之前執行 |
| *（省略）* | 預設順序，依註冊順序執行 |
| `'post'` | 在預設順序的外掛之後執行 |

在同一個順序群組內，外掛會依照它們在 `plugins` 陣列中出現的順序執行。核心外掛（`variables`、`keyframes`、`selectors`、`shortcuts`、`important`）會自動加到最前面並使用預設順序，因此預設順序的使用者外掛一定會在它們之後執行。

## 生命週期與注意事項 {#lifecycle-and-gotchas}

第一次撰寫外掛時容易忽略的運作行為。

### Hook 錯誤會被捕捉，而不是拋出 {#hook-errors-are-caught-not-thrown}

如果某個 hook 拋出錯誤，引擎會記錄該錯誤，並帶著先前的 payload 繼續執行 pipeline（`packages/core/src/plugin.ts`）。`createEngine()` 不會失敗，後續的外掛仍會執行。有兩個影響：

- 有問題的外掛會默默失效，開發時請留意 log 輸出（`Plugin "<name>" failed to execute hook "<hook>"`）。
- 會拋出錯誤的 transform hook 會讓 payload 維持在你的外掛執行前的狀態，因此如果你是就地修改 payload，在拋出前所做的部分變動可能仍然看得到。

### `order: 'pre'` 會在核心服務掛上之前執行 {#order-pre-runs-before-core-services-attach}

`engine.selectors`、`engine.shortcuts`、`engine.keyframes` 與 `engine.variables` 是由核心外掛在*它們自己的* `configureEngine` hook 中掛上的。帶有 `order: 'pre'` 的外掛會在這件事發生之前就執行 `configureEngine`，因此在那裡存取這些服務會拋出錯誤，而根據前一點，這個錯誤只會變成一行 log 訊息。在建構時就存在的引擎方法（`addPreflight`、`appendAutocomplete`、`appendCssImport`、`addConfigDependency`）在任何順序群組中都能安全使用。`@pikacss/plugin-design-tokens` 就是一個遵守這條規則的真實 `order: 'pre'` 外掛：它只會變動原始設定，並呼叫 `addConfigDependency`。

### 用 `addConfigDependency` 註冊載入的檔案 {#register-loaded-files-with-addconfigdependency}

如果你的外掛會讀取外部檔案（token 檔、圖示集、JSON 主題），請註冊每一個載入的路徑：

```ts
defineEnginePlugin({
  name: 'my-plugin',
  configureEngine: (engine) => {
    engine.addConfigDependency('/absolute/path/to/tokens.json')
  },
})
```

建置整合會監看這些路徑，並在其中之一變更時重新建立引擎——確切地說是在它的*內容*變更時，所以一個位元組維持不變的相依會被視為沒有變更，即使它的意義已經改變（見 [SSR 與正式環境](/zh-tw/integrations/ssr-and-production#what-triggers-a-reload-in-dev)）。少了這個，使用者就必須重新啟動開發伺服器，才能套用你外掛原始檔的變更。`@pikacss/plugin-design-tokens` 正是這樣重新載入 token 檔的。

## 測試外掛 {#testing-a-plugin}

外掛的 hook 都是單純的函式，因此大多數外掛行為的測試不需要真正的引擎，可以比照官方的 `@pikacss/plugin-reset` 測試（`packages/plugin-reset/src/index.test.ts`）：用最精簡的 mock 直接呼叫這些 hook，然後斷言其效果。

```ts
import { describe, expect, it, vi } from 'vitest'
import { myPlugin } from './index'

describe('myPlugin', () => {
  it('registers its layer and preflight', async () => {
    const plugin = myPlugin()
    const engine = { addPreflight: vi.fn() }
    const config: Record<string, any> = {}

    plugin.configureRawConfig?.(config as any)
    await plugin.configureEngine?.(engine as any)

    expect(config.layers).toEqual({ 'my-layer': 5 })
    expect(engine.addPreflight).toHaveBeenCalled()
  })
})
```

如果要對產生的 CSS 做端對端斷言，請改為建立一個真正的引擎：`const engine = await createEngine({ plugins: [myPlugin()] })`，接著 `await engine.use({ ... })`，再對 `await engine.renderAtomicStyles(true)` 拍快照。

## 下一步 {#next}

- [可用的 Hook](/zh-tw/plugin-development/available-hooks)：所有你可以實作的生命週期 hook。
- [型別擴增](/zh-tw/plugin-development/type-augmentation)：為你的外掛擴充 PikaCSS 型別。
- [Define 輔助函式](/zh-tw/plugin-development/define-helpers)：`defineEngineConfig` 與 `defineEnginePlugin`。
