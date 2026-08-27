---
title: 比較
description: PikaCSS 與 UnoCSS、Tailwind CSS、Panda CSS 以及 vanilla-extract 的比較。
relatedPackages:
  - '@pikacss/core'
  - '@pikacss/unplugin-pikacss'
relatedSources:
  - packages/core/src/atomic-style.ts
  - packages/core/src/property-effects.ts
  - packages/integration/src/ctx.ts
category: getting-started
order: 15
translation:
  sourceFile: docs/getting-started/comparison.md
  sourceCommit: 36ab046b5f27060274a79d160c9b43606652d780
  sourceBlob: e140232354baca1694871170271c7dc6784efcce
---

# 比較 {#comparison}

PikaCSS 與其他建置時期樣式工具之間的關係，以及在什麼情況下它是（或不是）正確的選擇。

::: info 誠實的定位
PikaCSS 目前仍在 1.0 之前，API 尚未穩定。下面其他工具更為成熟，也擁有更大的生態系。這份比較著重在撰寫模型與引擎設計，而不是哪個專案「比較好」。競品的描述整理自各專案自己文件中的定位；最新細節請查閱它們的文件。
:::

## 概覽 {#at-a-glance}

| | PikaCSS | UnoCSS | Tailwind CSS | Panda CSS | vanilla-extract |
|---|---|---|---|---|---|
| **撰寫語法** | 直接寫在元件裡的 CSS-in-JS 物件：`pika({ color: 'red' })` | 寫在標記裡的 utility class 名稱（外加 attributify 與其他 preset） | 寫在標記裡的 utility class 名稱 | 元件裡的 CSS-in-JS 函式（`css()`、recipe），會靜態擷取 | 放在獨立 `.css.ts` 檔案裡的 CSS-in-TS |
| **執行階段成本** | 無：每次呼叫都會在 build time 替換成設定好的 class-name 資料（預設字串，也可設定成字串陣列） | 無：CSS 在建置時期產生 | 無：CSS 在建置時期產生 | CSS 在建置時期產生；由一個輕量的 JS 執行階段負責組合 class 名稱 | 靜態樣式無成本；動態值可選用執行階段輔助工具 |
| **動態值** | 不能放在引數裡：請改用 [variant map 或 CSS 變數](/zh-tw/getting-started/dynamic-styles) | class 名稱必須能靜態偵測到 | class 名稱必須能靜態偵測到 | 靜態擷取；執行階段值透過 CSS 變數 | 透過 `assignInlineVars` 使用 CSS 變數 |
| **SSR** | 不需要特殊處理：輸出是一般的 [靜態 CSS artifacts](/zh-tw/integrations/ssr-and-production) | 靜態 CSS 輸出 | 靜態 CSS 輸出 | 靜態 CSS 輸出 | 靜態 CSS 輸出 |
| **型別安全** | 產生出來的型別會驅動 IDE 對屬性、選擇器與 shortcut 的自動完成；同時仍接受任意字串 | class 名稱是純字串；有提供 IDE 擴充功能 | class 名稱是純字串；有提供 IDE 擴充功能 | 為 token 與 recipe 產生型別 | 具備強型別的樣式物件 |
| **成熟度** | 1.0 之前，API 尚未穩定 | 成熟，廣泛使用 | 非常成熟，生態系龐大 | 成熟 | 成熟 |

## 真正的差異在哪裡 {#what-actually-differs}

### CSS-in-JS 撰寫、atomic CSS 輸出 {#css-in-js-authoring-atomic-css-output}

utility class 工具（UnoCSS、Tailwind CSS）要求你學習並輸入它們的 class 詞彙。PikaCSS 則是把單純的 CSS 屬性名稱保留在 JavaScript 物件裡（與行內樣式或 styled-components 相同的心智模型），並且一樣會輸出去除重複後的原子 class。見 [pika() 如何運作](/zh-tw/getting-started/what-is-pikacss#how-pika-works)。

### 簡寫屬性／個別屬性（longhand）的層疊衝突由引擎解決 {#shorthand-longhand-cascade-conflicts-are-resolved-by-the-engine}

atomic CSS 有一個結構性問題：當 `padding` 與 `padding-top` 的 class 落在同一個元素上時，勝出者是由樣式表順序決定，而不是由你的意圖決定。其他生態系裡存在執行階段的 class 合併工具，用來繞過這個問題。

PikaCSS 則是在建置時期解決它：引擎會追蹤重疊的屬性效果，並保證覆寫用的宣告一定會渲染在它所覆寫的宣告之後，若重複使用舊的 class 會破壞這個順序，就改為建立一個新的 class（`packages/core/src/atomic-style.ts`、`packages/core/src/property-effects.ts`）。

::: code-group

<<< @/zh-tw/.examples/getting-started/cascade.example.pikain.ts [輸入]

<<< @/zh-tw/.examples/getting-started/cascade.example.pikaout.css [輸出]

:::

### 真正的零執行階段成本，連函式本身也是 {#truly-zero-runtime-including-the-function-itself}

`pika()` 在 runtime 並不存在。Build plugin 會把每次呼叫替換成設定好的 class-name 資料（預設字串，也可設定成字串陣列），因此不會有 PikaCSS styling library 被送到瀏覽器。採用 `css()` 風格 API 的工具同樣會在 build time 產生 CSS，但函式本身通常仍會在瀏覽器裡執行以組合 class 名稱；utility class 工具則一開始就沒有 runtime function。

### 取捨：只能用靜態引數 {#the-trade-off-static-only-arguments}

由於呼叫是在建置時期求值，引數必須是自足的常值：不能有變數、條件式，或對外層值的 spread。這與 Tailwind「不要動態組合 class 名稱」的規則屬於同一類限制，只是表現在函式呼叫的層級上。[動態樣式](/zh-tw/getting-started/dynamic-styles) 涵蓋了支援的各種模式。

## 何時不該使用 PikaCSS {#when-not-to-use-pikacss}

- 你現在就需要穩定的 1.0 API 以及長期的遷移保證。
- 你依賴一個龐大的生態系，裡面有大量綁定特定 class 詞彙的預先建置 UI 元件。
- 你的樣式大多是 CSS 變數無法表達、真正在執行階段計算出來的值。

## 下一步 {#next}

- [安裝與設定](/zh-tw/getting-started/setup)：在專案裡試試看。
- [什麼是 PikaCSS](/zh-tw/getting-started/what-is-pikacss)：完整的概念導覽。
- [動態樣式](/zh-tw/getting-started/dynamic-styles)：執行階段驅動樣式的各種模式。
