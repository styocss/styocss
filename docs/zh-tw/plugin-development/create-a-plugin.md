---
title: 建立外掛
description: 學習如何用 defineEnginePlugin 建立 PikaCSS 引擎外掛。
relatedPackages:
  - '@pikacss/core'
relatedSources:
  - packages/core/src/plugin.ts
  - packages/core/src/diagnostics.ts
  - packages/core/src/engine.ts
  - packages/plugin-reset/src/index.test.ts
category: plugin-development
order: 10
translation:
  sourceFile: docs/plugin-development/create-a-plugin.md
  sourceCommit: a7466c306ba85e94bbe1c3c44ef2f0cab0c46410
  sourceBlob: 9e866d7d5e263435c3b367b8fcea230f6ab7b372
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

## 每引擎狀態 {#per-engine-state}

`defineEnginePlugin()` 回傳的外掛物件是可重用的**定義**：同一個物件可以傳給任意數量的 `createEngine()` 呼叫，無論是循序或並發。因此可變的每引擎資料絕不能放在外掛工廠的 closure 裡 — 第二個重用該定義的引擎會覆寫它，而第一個引擎仍在讀取。

用 `createState` 宣告引擎本地狀態，並透過每個 hook 最後一個參數 `context.state` 存取：

```ts
defineEnginePlugin({
  name: 'my-plugin',
  createState: () => ({ resolved: {} as MyPluginOptions }),
  configureRawConfig: (config, context) => {
    context.state.resolved = config.myPlugin ?? {}
  },
  configureEngine: (engine, context) => {
    // Long-lived callbacks must capture `context` (stable per engine),
    // never a mutable closure variable shared by every engine.
    engine.addPreflight(() => renderCss(context.state.resolved))
  },
})
```

引擎對每個外掛定義**每個引擎**至多呼叫一次 `createState()`，時機在該外掛於該引擎的第一個 hook 執行之前；之後該外掛／引擎配對的每次 hook 呼叫都會收到同一個 context 物件，從 `configureRawConfig` 一路到已提交的通知。無狀態的外掛直接省略 `createState` 即可。永不變動的工廠參數可以留在 closure 中作為不可變的定義設定。

兩個要遵守的邊界：

- 刻意共享的 process 全域快取，只有在它的鍵涵蓋所有可能影響結果的輸入時才允許 — 優先使用每引擎狀態。
- 每引擎狀態是**引擎生命週期**的狀態。暫定階段的 transform hook 在模組提交之前執行（見[交易式生命週期](/zh-tw/plugin-development/available-hooks#transformstylecontents)），所以不要在暫定 transform 中急切地變動永久的 `context.state`，並期待模組失敗或被取代時會回滾。

## 生命週期與注意事項 {#lifecycle-and-gotchas}

第一次撰寫外掛時容易忽略的運作行為。

### Hook 錯誤會先回報、再重新拋出 {#hook-errors-are-reported-then-rethrown}

如果某個 hook 拋出錯誤，引擎會回報一筆 `plugin-hook-error` 診斷，然後重新拋出（`packages/core/src/plugin.ts`）：設定類 hook 失敗時 `createEngine()` 會 reject，暫定階段的 transform hook 失敗時 `engine.use()` 會 reject — 失敗的生命週期絕不會被轉換成默默的部分結果。有兩個影響：

- 失敗的外掛會中止觸發它的那次呼叫。開發時請留意 `Plugin "<name>" failed to execute hook "<hook>"` 診斷；bundler 整合會把設定失敗以 config-load 診斷呈現。
- 唯一的例外是已提交的通知 `atomicStyleAdded`：它在樣式已註冊之後才觸發，因此拋錯的觀察者會以診斷回報，但絕不會回滾該次提交 — 且後續外掛的觀察者會跳過那一次通知。見[可用的 Hook](/zh-tw/plugin-development/available-hooks#atomicstyleadded)。

### 在 Engine 建構前 lower semantic definitions {#lower-semantic-definitions-before-engine-construction}

Selector、shortcut、variable、keyframe都是 config-backed semantic domain，刻意沒有 public runtime `.add()` ingress。Plugin應在 `configureRawConfig` append object definitions，由Core一致負責 normalization、runtime resolution、Typegen與finalization。

`configureEngine` 用於 initialized Engine API與 owner-bound `engine.pika` / `engine.typegen` capability。`order`仍控制 lifecycle順序，但不是用來取得 mutable Core producer service的機制。


### 在初始化期間註冊 configuration inputs {#register-configuration-inputs-during-initialization}

若 plugin 會讀取定義 Engine generation 的外部檔案，請在初始化期間註冊**絕對路徑**：

```ts
defineEnginePlugin({
  name: 'my-plugin',
  configureEngine(engine) {
    engine.runtime.addConfigDependency('/absolute/path/to/tokens.json')
  },
})
```

若 direct directory member 的 create/delete/rename 會影響設定，使用獨立的 initialization-only `engine.runtime.addConfigDirectoryMembershipDependency()`。

Engine 初始化完成後 dependency set 就會 freeze。之後從 `engine.use()`、resolver 或其他 runtime phase 再註冊 dependency 會直接報錯；不會動態擴張 active watcher。Integration 會把 finalized Engine dependencies 與 canonical config-module dependencies 合併成整個 `ProjectGeneration` 的 watch inputs。


## 測試外掛 {#testing-a-plugin}

外掛的 hook 都是單純的函式，因此大多數外掛行為的測試不需要真正的引擎，可以比照官方的 `@pikacss/plugin-reset` 測試（`packages/plugin-reset/src/index.test.ts`）：用最精簡的 mock 直接呼叫這些 hook，然後斷言其效果。手動呼叫 hook 時必須提供引擎平常會提供的 context — **每個模擬引擎建立一個 context**（`{ onDiagnostic, state: plugin.createState?.(), host: {} }`），並把同一個物件傳給該引擎的每次 hook 呼叫，否則外掛對 `context.state` 或 `context.host` 的存取會在執行期拋出錯誤 — 這對無狀態外掛同樣適用，因為 hook 可能不依賴 state 也會讀取 `host`。

```ts
import { describe, expect, it, vi } from 'vitest'
import { myPlugin } from './index'

function createContext(plugin: any) {
  return { onDiagnostic: vi.fn(), state: plugin.createState?.(), host: {} }
}

describe('myPlugin', () => {
  it('registers its layer and preflight', async () => {
    const plugin = myPlugin()
    const context = createContext(plugin)
    const engine = { addPreflight: vi.fn() }
    const config: Record<string, any> = {}

    plugin.configureRawConfig?.(config as any, context)
    await plugin.configureEngine?.(engine as any, context)

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
