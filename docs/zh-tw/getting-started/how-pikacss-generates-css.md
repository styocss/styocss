---
title: PikaCSS 如何產生 CSS
description: 引擎的運作模型：去除重複、屬性覆寫、備用值、排序，以及 layer 分組。
relatedPackages:
  - '@pikacss/core'
relatedSources:
  - packages/core/src/atomic-style.ts
  - packages/core/src/engine.ts
  - packages/core/src/extractor.ts
  - packages/core/src/property-effects.ts
category: getting-started
order: 60
translation:
  sourceFile: docs/getting-started/how-pikacss-generates-css.md
  sourceCommit: 33431c15728d378cc7bd9c37fd5c3b3e86e51318
  sourceBlob: 6aa9738a5c6616c93159e60196ec3a9619c4f4e4
---

# PikaCSS 如何產生 CSS {#how-pikacss-generates-css}

從一次 `pika()` 呼叫到某個 entry 的 generated stylesheet 之間，引擎做了哪些事。了解這些規則，就能解釋該 entry 的 logical `cssModule`（single-entry 預設為 `pika.css`）背後的 CSS artifact。

## 管線 {#the-pipeline}

1. 建置外掛會掃描納入的檔案，找出 `pika()` 呼叫。
2. 每一次呼叫的引數都會在建置時期求值，並傳給引擎。
3. 引擎會把每一組 `[selector, property, value]` 三元組擷取成一筆原子樣式，並給它一個簡短的 class ID（`pk-a`、`pk-b`、……）。
4. 外掛會把原始碼裡的呼叫替換成設定好的 class-name 輸出：預設是以空白串接的字串；owning entry 設定 `transformedFormat: 'array'` 時則是字串陣列。
5. 該 entry 蒐集到的原子樣式會渲染成自己的 runtime CSS artifact，再由該 entry 的 logical `cssModule` 解析到它。

## 去除重複 {#deduplication}

原子樣式是以它的 `[selector, property, value]` 內容作為鍵值。同一條宣告不論用在你專案裡的哪個地方（不管是不是同一個檔案），都會解析到同一個 class：

::: code-group

<<< @/zh-tw/.examples/getting-started/dedup.example.pikain.ts [輸入]

<<< @/zh-tw/.examples/getting-started/dedup.example.pikaout.css [輸出]

:::

兩次呼叫共用 `.pk-a { display: flex; }`。輸出的大小取決於*不重複*宣告的數量，而不是呼叫地點的數量。

## 每個屬性由最後宣告勝出 {#last-wins-per-property}

在同一次 `pika()` 呼叫裡（涵蓋它的所有引數，包含展開後的 shortcut），對同一組 `[selector, property]` 配對，較後面的定義會取代較前面的定義；最終只會輸出最後那個值：

::: code-group

<<< @/zh-tw/.examples/getting-started/last-wins.example.pikain.ts [輸入]

<<< @/zh-tw/.examples/getting-started/last-wins.example.pikaout.css [輸出]

:::

`color: 'red'` 永遠不會出現在樣式表裡。正是這一點，讓 `pika('btn', { backgroundColor: 'purple' })` 這類組合行為表現得像覆寫，而不是衝突。

## `null` 會移除一個屬性 {#null-removes-a-property}

把 `null`（或 `undefined`）當作值傳入，會移除同一次呼叫裡對該屬性較早的任何定義；這在你想從 shortcut 或共用基礎樣式裡減去某一條宣告時很有用：

::: code-group

<<< @/zh-tw/.examples/getting-started/null-removal.example.pikain.ts [輸入]

<<< @/zh-tw/.examples/getting-started/null-removal.example.pikaout.css [輸出]

:::

引擎會完全捨棄 `boxShadow` 這條宣告，不會為它產生任何原子 class。

## 備用值 {#value-fallbacks}

`[value, fallbacks]` 元組會在同一條規則裡先渲染備用值（fallback）、最後才渲染主要值，這樣支援主要值的瀏覽器就會使用主要值，較舊的瀏覽器則沿用備用值：

::: code-group

<<< @/zh-tw/.examples/getting-started/value-fallbacks.example.pikain.ts [輸入]

<<< @/zh-tw/.examples/getting-started/value-fallbacks.example.pikaout.css [輸出]

:::

## 輸出順序 {#output-ordering}

產生出來的樣式表是決定性的：

- 每一筆原子樣式都會得到一個**渲染權重**：當它只用到預設選擇器（也就是單純的 class 規則）時為 `0`，否則就是巢狀選擇器區段的數量（一條包在 `@media` 裡、又包在偽選擇器裡的規則，權重會比單純規則高）。樣式會依權重由小到大排序，因此較簡單的規則一定排在前面。
- 在相同權重下，樣式會保持它們的**註冊順序**（排序是穩定的）。
- **簡寫屬性／個別屬性（longhand）的衝突**受到順序保護：當同一次呼叫裡某個屬性與較早的屬性效果重疊時（例如先 `padding` 再 `paddingTop`），引擎會把較後面的那個標記為順序敏感，並且只有在既有 class 已經排在它必須覆寫的那些 class 後面時，才會重複使用該 class；否則就會建立一個新的 class。這就是為什麼無論 class 在別處如何重複使用，`paddingTop` 都能可靠地勝過 `padding`。

一個實際的結果是：當同一個元素上有兩個*獨立*的原子 class 設定了同一個屬性時，決定勝負的是樣式表裡的位置，而不是你 `class` 屬性裡的順序。請優先使用單次呼叫的組合（最後者勝出），而不要把互相衝突的 class 疊在一起。

## Layer 分組 {#layer-grouping}

原子樣式會包在一個 CSS `@layer` 區塊裡。引擎預設會宣告兩個 layer，也就是 `preflights`（權重 `1`）與 `utilities`（權重 `10`），並輸出一段依權重排序的順序宣告：

```css
@layer preflights, utilities;
```

- 除非某個定義把 `__layer` 設成另一個已設定的 layer，否則原子樣式都會進入預設的 utilities layer。
- 沒有明確指定 layer 的 preflight，當該 layer 名稱存在於已設定的 layers 裡時，會包進預設的 preflights layer。
- 若某個 `__layer` 值**不在**已設定的 layers 裡，引擎不會默默採用它：它會輸出一則警告，並把該樣式以不分 layer 的方式渲染。請注意，不分 layer 的 CSS 其層疊優先權高於任何 layer，因此請務必在 `layers` 設定裡註冊自訂的 layer。
- 指派到未宣告 layer 的 preflight，會渲染成一個尾端的 `@layer` 區塊，且不會出現在順序宣告裡；依照 `@layer` 的語意，它接著會排在所有已宣告 layer 的後面，因此它會*勝過所有 layer*，而這通常與原本的意圖相反。請改為用明確的權重來註冊該 layer。

關於設定 layer 名稱與權重，請見 [Layers](/zh-tw/customizations/layers)。

## 下一步 {#next}

- [Layers](/zh-tw/customizations/layers)：控制 layer 名稱、權重與 `__layer` 的用法。
- [動態樣式](/zh-tw/getting-started/dynamic-styles)：建立在這些規則之上的執行階段驅動樣式模式。
- [引擎設定](/zh-tw/getting-started/engine-config)：所有引擎選項。
