---
title: 可用的 Hook
description: PikaCSS 引擎外掛生命週期 hook 的完整參考。
relatedPackages:
  - '@pikacss/core'
relatedSources:
  - packages/core/src/plugin.ts
  - packages/core/src/engine.ts
category: plugin-development
order: 20
translation:
  sourceFile: docs/plugin-development/available-hooks.md
  sourceCommit: 1e022f268ec0104f0921639b2185345e818b0107
  sourceBlob: 9928f6611b3bc27ce1095d31069c042d6c718697
---

# 可用的 Hook {#available-hooks}

PikaCSS 外掛可以實作在引擎生命週期特定時機執行的 hook。

## configureRawConfig {#configurerawconfig}

### 簽章 {#signature}

```ts
configureRawConfig?: (config: EngineConfig) => void | EngineConfig | Promise<void | EngineConfig>
```

### 時機 {#when}

會在 `createEngine()` 期間、把原始設定解析為最終形式之前呼叫。外掛可以就地變動設定物件，或回傳一個新的。

### 範例 {#example}

```ts
defineEnginePlugin({
  name: 'add-layer',
  configureRawConfig: (config) => {
    config.layers ??= {}
    config.layers['my-layer'] = 5
  },
})
```

## rawConfigConfigured {#rawconfigconfigured}

### 簽章 {#signature-1}

```ts
rawConfigConfigured?: (config: EngineConfig) => void
```

### 時機 {#when-1}

會在所有外掛的 `configureRawConfig` 都執行完之後呼叫。此時原始設定已經定案，這是一個用來讀取最終原始設定的通知型 hook，而不是用來做變動的。

### 範例 {#example-1}

```ts
defineEnginePlugin({
  name: 'log-config',
  rawConfigConfigured: (config) => {
    console.log('Final raw config:', config)
  },
})
```

## configureResolvedConfig {#configureresolvedconfig}

### 簽章 {#signature-2}

```ts
configureResolvedConfig?: (config: ResolvedEngineConfig) => void | ResolvedEngineConfig | Promise<void | ResolvedEngineConfig>
```

### 時機 {#when-2}

會在原始設定解析成 `ResolvedEngineConfig` 之後呼叫。外掛可以調整解析後的值，例如 prefix、layer 或自動完成狀態。

### 範例 {#example-2}

```ts
defineEnginePlugin({
  name: 'override-prefix',
  configureResolvedConfig: (config) => {
    config.prefix = 'custom-'
  },
})
```

## configureEngine {#configureengine}

### 簽章 {#signature-3}

```ts
configureEngine?: (engine: Engine) => void | Engine | Promise<void | Engine>
```

### 時機 {#when-3}

會在引擎實例建構完成之後呼叫。外掛可以加入 preflight、註冊自動完成項目，或用自訂行為擴充引擎。

::: warning 核心服務與 `order: 'pre'`
`engine.selectors`、`engine.shortcuts`、`engine.keyframes` 與 `engine.variables` 這些服務是由核心外掛自己的 `configureEngine` hook 掛上的。核心外掛會在預設順序群組中執行，因此帶有 `order: 'pre'` 的外掛會在這些服務存在**之前**就抵達 `configureEngine`，此時去存取它們會拋出錯誤，且 `createEngine()` 會 reject；bundler 整合會把這呈現為 config-load 診斷並退回到無外掛的引擎，因此根本原因很容易被忽略。當你需要這些服務時，請使用預設順序；或是把 `'pre'` 外掛限制在設定 hook，以及在建構時就存在的引擎方法（例如 `addPreflight` 與 `addConfigDependency`）。見 [生命週期與注意事項](/zh-tw/plugin-development/create-a-plugin#lifecycle-and-gotchas)。
:::

### 範例 {#example-3}

```ts
defineEnginePlugin({
  name: 'add-preflight',
  configureRawConfig: (config) => {
    // 註冊這個外掛要渲染到的 layer。指派給未宣告 layer 的 preflight
    // 會渲染成一個結尾的 `@layer` 區塊，而這個區塊不在 layer 順序宣告
    // 之中，於是它獲得了最高的層疊優先權，這與 base layer 應有的行為
    // 正好相反。
    config.layers ??= {}
    config.layers.base ??= 0
  },
  configureEngine: async (engine) => {
    engine.addPreflight({
      layer: 'base',
      preflight: '*, *::before, *::after { box-sizing: border-box; }',
    })
    engine.selectors.add(['@dark', 'html.dark $'])
    engine.shortcuts.add(['flex-center', { display: 'flex', alignItems: 'center', justifyContent: 'center' }])
    engine.keyframes.add(['fade-in', { from: { opacity: '0' }, to: { opacity: '1' } }])
    engine.variables.add({ '--color-primary': '#3b82f6' })
  },
})
```

預設的 layer 是 `preflights`（權重 `1`）與 `utilities`（權重 `10`）；把 `base` 註冊為權重 `0`，會讓它在 `@layer` 順序宣告中排在兩者之前。

## transformSelectors {#transformselectors}

### 簽章 {#signature-4}

```ts
transformSelectors?: (selectors: string[]) => string[] | void | Promise<string[] | void>
```

### 時機 {#when-4}

會在樣式擷取期間解析選擇器字串時呼叫。外掛可以改寫、展開或篩選選擇器的值。回傳 `void` 可讓目前的選擇器清單維持不變。

### 範例 {#example-4}

```ts
defineEnginePlugin({
  name: 'dark-mode',
  transformSelectors: (selectors) => {
    return selectors.map(s =>
      s === '@dark' ? 'html.dark $' : s
    )
  },
})
```

## transformStyleItems {#transformstyleitems}

### 簽章 {#signature-5}

```ts
transformStyleItems?: (items: StyleItem[]) => StyleItem[] | void | Promise<StyleItem[] | void>
```

### 時機 {#when-5}

會在 `engine.use()` 中處理樣式項目時呼叫。上面的簽章為了可讀性使用了基礎匯出的 `StyleItem` 別名，但執行階段的 payload 是套用任何 `PikaAugment.StyleItem` 擴充之後、已解析且具備擴增感知的樣式項目清單。外掛可以在樣式項目被擷取成原子樣式之前，注入、移除或改寫它們。回傳 `void` 可讓目前的樣式項目維持不變。

### 範例 {#example-5}

```ts
defineEnginePlugin({
  name: 'expand-shortcut',
  transformStyleItems: (items) => {
    return items.flatMap(item =>
      item === 'my-shortcut'
        ? [{ display: 'flex' }, { alignItems: 'center' }]
        : [item]
    )
  },
})
```

## transformStyleDefinitions {#transformstyledefinitions}

### 簽章 {#signature-6}

```ts
transformStyleDefinitions?: (definitions: StyleDefinition[]) => StyleDefinition[] | void | Promise<StyleDefinition[] | void>
```

### 時機 {#when-6}

會在樣式項目轉換成樣式定義之後呼叫。上面的簽章為了可讀性使用了基礎匯出的 `StyleDefinition` 別名，但執行階段的 payload 是套用任何 `PikaAugment.StyleDefinition` 擴充之後、已解析且具備擴增感知的定義清單。外掛可以在樣式定義被擷取成 atomic CSS 內容之前先轉換它們。回傳 `void` 可讓目前的樣式定義維持不變。

### 範例 {#example-6}

```ts
defineEnginePlugin({
  name: 'auto-prefix',
  transformStyleDefinitions: (definitions) => {
    return definitions
  },
})
```

## transformStyleContents {#transformstylecontents}

### 簽章 {#signature-7}

```ts
transformStyleContents?: (contents: StyleContent[]) => StyleContent[] | void | Promise<StyleContent[] | void>
```

### 時機 {#when-7}

會在擷取與正規化之後、任何 atomic style ID 被配置之前呼叫。每個 `StyleContent` 是一筆正規化後的原子項目（`selector`、`property`、`value`）。這是最後一個暫定（provisional）階段的接縫：外掛可以 1→1 改寫或 1→N 展開項目 — 相容性降轉、邏輯屬性轉換、自訂最佳化，或 PikaCSS 層級的前綴 — 而不會在轉換成功之前消耗任何 ID。Hook 執行後引擎會重新去重並重新計算順序敏感度。拋出錯誤會中止準備階段，且不留下任何已提交的引擎狀態。回傳 `void` 可讓目前的內容維持不變。

### 範例 {#example-7}

```ts
defineEnginePlugin({
  name: 'user-select-lowering',
  transformStyleContents: (contents) => {
    return contents.flatMap(content =>
      content.property === 'user-select'
        ? [{ ...content, property: '-webkit-user-select' }, content]
        : [content]
    )
  },
})
```

## preflightUpdated {#preflightupdated}

### 簽章 {#signature-8}

```ts
preflightUpdated?: () => void
```

### 時機 {#when-8}

會在每次加入 preflight 或 CSS import 變更時呼叫。用這個 hook 來對 preflight 的變化做出反應。

### 範例 {#example-8}

```ts
defineEnginePlugin({
  name: 'preflight-watcher',
  preflightUpdated: () => {
    console.log('Preflights changed')
  },
})
```

## atomicStyleAdded {#atomicstyleadded}

### 簽章 {#signature-9}

```ts
atomicStyleAdded?: (atomicStyle: AtomicStyle) => void
```

### 時機 {#when-9}

每次有新的原子樣式註冊到引擎的 store 時呼叫。可以用它來做追蹤、分析或副作用。

::: warning 已提交的通知，不是變更接縫
這個 hook 觸發時，樣式已經提交完成：它的 ID、快取鍵與 store 索引都已建立，因此不支援變更 payload。拋出的錯誤會以診斷回報，但絕不會回滾該次註冊 — 且後續外掛的觀察者會跳過那一次通知，所以觀察者不應該拋出錯誤。需要轉換樣式的外掛必須改用暫定階段的 hook（`transformStyleItems`、`transformStyleDefinitions`、`transformSelectors`、`transformStyleContents`）。
:::

### 範例 {#example-9}

```ts
defineEnginePlugin({
  name: 'style-tracker',
  atomicStyleAdded: (atomicStyle) => {
    console.log(`New style: ${atomicStyle.id}`)
  },
})
```

## autocompleteConfigUpdated {#autocompleteconfigupdated}

### 簽章 {#signature-10}

```ts
autocompleteConfigUpdated?: () => void
```

### 時機 {#when-10}

會在自動完成設定變更時呼叫。用它來對新的自動完成項目做出反應。

### 範例 {#example-10}

```ts
defineEnginePlugin({
  name: 'autocomplete-watcher',
  autocompleteConfigUpdated: () => {
    console.log('Autocomplete updated')
  },
})
```

## 下一步 {#next}

- [型別擴增](/zh-tw/plugin-development/type-augmentation)：擴充 PikaCSS 型別。
- [建立外掛](/zh-tw/plugin-development/create-a-plugin)：外掛結構與 defineEnginePlugin 輔助函式。
- [Define 輔助函式](/zh-tw/plugin-development/define-helpers)：`defineEngineConfig` 與 `defineEnginePlugin`。
