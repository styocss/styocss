---
title: ESLint 設定
description: 設定 ESLint 規則，在你的專案裡強制 pika() 引數必須是靜態的。
relatedPackages:
  - '@pikacss/eslint-config'
relatedSources:
  - packages/eslint-config/src/index.ts
category: getting-started
order: 50
translation:
  sourceFile: docs/getting-started/eslint-config.md
  sourceCommit: c315de51caf6711bbfa80bfe86a4d4eb1c4cfb40
  sourceBlob: 678a2e21f9231a066d7aed054a2e4963ce804b63
---

# ESLint 設定 {#eslint-config}

PikaCSS 提供一個 ESLint 外掛，用來確保所有 `pika()` 引數在建置時期都是可靜態分析的。

## 安裝與設定 {#setup}

安裝套件：

::: code-group

```sh [pnpm]
pnpm add -D @pikacss/eslint-config
```

```sh [npm]
npm install -D @pikacss/eslint-config
```

```sh [yarn]
yarn add -D @pikacss/eslint-config
```

:::

把建議的設定加入你的 `eslint.config.js`：

```ts
// eslint.config.js
import pikacss from '@pikacss/eslint-config'

export default [
  pikacss(),
]
```

若要使用自訂的函式名稱：

```ts
import pikacss from '@pikacss/eslint-config'

export default [
  pikacss({ fnName: 'css' }),
]
```

## 規則 {#rules}

### no-dynamic-args {#no-dynamic-args}

#### 說明 {#description}

強制 `pika()`、`pika.str()` 與 `pika.arr()` 的所有引數，在建置時期都必須是可靜態分析的。不支援動態值、計算後的運算式，以及執行階段的變數。

#### 什麼算是靜態的 {#what-counts-as-static}

這個規則會用與建置時期編譯器相同、能感知值的求值器來評估每一個引數。以下這些形式是靜態的：

- 常值：字串、數字、布林值，以及 `null`
- 值本身也是靜態的物件與陣列常值（允許巢狀）：`{ color: 'red' }`、`[{ color: 'red' }, 'flex-center']`
- 內插值會求值成靜態原始值的範本常值（template literal）
- 作用在靜態運算元上的一元、二元、邏輯與條件運算式：條件運算式的測試部分必須是靜態的，但只有它所選到的分支需要是靜態的（`&&`／`||`／`??` 也只看實際採用的那一側）
- 全域常數 `undefined`、`NaN` 與 `Infinity`，除非有本地宣告將它們遮蔽

以下這些**不是**靜態的：

- 任何其他變數或識別字的引用：包含對 `const` 的引用，因為編譯器從不解析繫結
- 函式呼叫
- 成員運算式
- 對不是靜態陣列或物件的值使用 spread
- 內插了動態值或非原始值的範本常值

#### 範例 {#examples}

```ts
// ✅ 有效
pika({ color: 'red' })
pika({ 'color': 'red', '$:hover': { color: 'blue' } })
pika('flex-center')

// ❌ 無效：動態變數
const color = getColor()
pika({ color })

// ❌ 無效：條件式
pika(isDark ? { color: 'white' } : { color: 'black' })

// ❌ 無效：spread
pika({ ...baseStyles })
```

## 下一步 {#next}

- [整合](/zh-tw/integrations/unplugin)：搭配你的建置工具設定 PikaCSS。
- [使用方式](/zh-tw/getting-started/usage)：看看常見的樣式模式。
