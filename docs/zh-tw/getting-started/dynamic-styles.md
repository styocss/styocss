---
title: 動態樣式
description: 在 PikaCSS 可靜態分析的限制下，用於執行階段驅動樣式的各種模式。
relatedPackages:
  - '@pikacss/core'
  - '@pikacss/integration'
relatedSources:
  - packages/integration/src/ctx.ts
  - packages/core/src/plugins/shortcuts.ts
  - packages/eslint-config/src/rules/no-dynamic-args.ts
category: getting-started
order: 35
translation:
  sourceFile: docs/getting-started/dynamic-styles.md
  sourceCommit: 36ab046b5f27060274a79d160c9b43606652d780
  sourceBlob: c366a0ea881233d7949d39e6f6c8abdec878a7bb
---

# 動態樣式 {#dynamic-styles}

`pika()` 的引數必須是靜態的，但你的 UI 不是。本頁介紹涵蓋執行階段驅動樣式的各種模式。

## 為什麼會有這個限制 {#why-the-constraint-exists}

在建置時期，外掛會從你的原始碼擷取每一次 `pika()` 呼叫，並把它的引數當成一段自足的運算式來求值，過程中不會執行你模組裡的其他程式碼（`packages/integration/src/ctx.ts`）。任何引用變數、呼叫函式，或根據執行階段狀態分支的內容，都無法用這種方式求值：

```ts
// ❌ 這些在建置時期會失敗：呼叫看不到 `color` 或 `isDark`
pika({ color })
pika({ color: isDark ? 'white' : 'black' })
```

[ESLint 規則 `no-dynamic-args`](/zh-tw/getting-started/eslint-config) 會在建置之前先抓出這些問題。下面每個模式背後的關鍵觀念是：**樣式的集合必須是靜態的，但你在執行階段要套用哪個樣式完全由你決定**；`pika()` 只是回傳一個字串。

## 模式 1：Variant Map {#pattern-1-variant-maps}

每個 variant 寫一次 `pika()` 呼叫，然後在執行階段從中選擇。每一次呼叫都在建置時期編譯；選擇的動作只是單純的物件存取。

::: code-group

<<< @/zh-tw/.examples/getting-started/variant-map.example.pikain.ts [輸入]

<<< @/zh-tw/.examples/getting-started/variant-map.example.pikaout.css [輸出]

:::

注意在輸出裡，共用的宣告（`color: white`）會在各個 variant 之間去除重複，合併成同一個原子 class。

布林狀態的運作方式相同：

```ts
const tabClass = pika({ padding: '0.5rem 1rem' })
const activeTabClass = pika({ fontWeight: '700', color: '#3b82f6' })

// 在執行階段組合建置時期產生的字串
const className = isActive ? `${tabClass} ${activeTabClass}` : tabClass
```

::: warning 警告
當兩個 variant 在同一個元素上設定了重疊的屬性時，哪一個會勝出是由樣式表決定，而不是由 class 在標記（markup）中出現的順序決定。請讓 variant map 在每個屬性上互斥，或像上面那樣把基礎樣式與 variant 樣式拆開。見 [PikaCSS 如何產生 CSS](/zh-tw/getting-started/how-pikacss-generates-css#output-ordering)。
:::

## 模式 2：用 CSS 變數處理真正的執行階段值 {#pattern-2-css-variables-for-truly-runtime-values}

當數值本身只存在於執行階段時（滑桿位置、計算出來的顏色、使用者內容），可在樣式定義裡引用一個 CSS 自訂屬性，並透過行內 `style` 屬性來設定該屬性：

::: code-group

<<< @/zh-tw/.examples/getting-started/runtime-value.example.pikain.ts [輸入]

<<< @/zh-tw/.examples/getting-started/runtime-value.example.pikaout.css [輸出]

:::

接著在執行階段餵入這個變數；原子 class 永遠不會改變：

::: code-group

```vue [Vue]
<div :class="progressBarClass" :style="{ '--progress': `${percent}%` }" />
```

```tsx [React]
<div className={progressBarClass} style={{ '--progress': `${percent}%` }} />
```

:::

## 模式 3：把 Shortcut 當成配方 {#pattern-3-shortcuts-as-recipes}

對於帶有具名 variant 的可重複使用多屬性樣式，可在引擎設定裡定義 [shortcut](/zh-tw/customizations/shortcuts)。shortcut 可以互相組合（一個 variant 可以包含基礎 shortcut），而使用時仍然維持為靜態字串：

```ts
// pika.config.ts
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  engine: {
    shortcuts: {
      definitions: [
        {
          name: 'btn',
          value: {
            display: 'inline-flex',
            alignItems: 'center',
            padding: '0.5rem 1rem',
            borderRadius: '0.5rem',
            border: 'none',
            cursor: 'pointer',
          },
        },
        { name: 'btn-primary', value: ['btn', { backgroundColor: '#3b82f6', color: 'white' }] },
        { name: 'btn-danger', value: ['btn', { backgroundColor: '#ef4444', color: 'white' }] },
      ],
    },
  },
})
```

::: code-group

<<< @/zh-tw/.examples/getting-started/recipe-shortcuts.example.pikain.ts [輸入]

<<< @/zh-tw/.examples/getting-started/recipe-shortcuts.example.pikaout.css [輸出]

:::

與模式 1 結合，即可在執行階段選擇一個 shortcut：

```ts
const buttonVariants = {
	primary: pika('btn-primary'),
	danger: pika('btn-danger'),
}
```

動態的 shortcut *規則*（以正規表達式為基礎，例如 [@pikacss/plugin-icons](/zh-tw/official-plugins/icons) 提供的圖示 shortcut）仍然要求比對到的字串本身要靜態地出現在某個 `pika()` 呼叫裡。

## 選擇一個模式 {#choosing-a-pattern}

| 情境 | 模式 |
|---|---|
| 少數幾個已知的 variant（尺寸、用途、作用中狀態） | Variant map |
| 在執行階段計算出來的值（位置、百分比、使用者顏色） | CSS 變數 + 行內樣式 |
| 跨元件共用的可重複使用配方 | Shortcut |

## 下一步 {#next}

- [PikaCSS 如何產生 CSS](/zh-tw/getting-started/how-pikacss-generates-css)：引擎如何處理你的呼叫。
- [Shortcuts](/zh-tw/customizations/shortcuts)：完整的 shortcut 設定參考。
- [ESLint 設定](/zh-tw/getting-started/eslint-config)：及早抓出動態引數。
