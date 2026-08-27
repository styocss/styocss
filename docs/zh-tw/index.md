---
layout: home
hero:
  name: PikaCSS
  text: Atomic CSS-in-JS 引擎
  tagline: 用 JS 物件撰寫樣式，產生零執行階段成本的 atomic CSS。
  image:
    light: /logo-black.svg
    dark: /logo-white.svg
    alt: PikaCSS 標誌
  actions:
    - theme: brand
      text: 開始使用
      link: /zh-tw/getting-started/what-is-pikacss
    - theme: alt
      text: API 參考
      link: /api/
features:
  - title: 零執行階段成本
    details: 所有 CSS 都在建置時期產生，正式環境沒有任何執行階段負擔。
    icon: ⚡
  - title: CSS-in-JS 語法
    details: 用熟悉的 CSS 屬性名稱撰寫樣式，不必背誦 utility class 名稱。
    icon: ✍️
  - title: Atomic CSS 輸出
    details: 每一條 CSS 宣告都會變成一個原子 class，讓重複使用最大化、bundle 體積最小化。
    icon: 🧬
  - title: 完全可自訂
    details: 選擇器、shortcut、變數、關鍵影格，以及強大的外掛系統。
    icon: 🔧
  - title: 不綁定框架
    details: 支援 Vite、Rollup、Rolldown、Webpack、Rspack 與 Nuxt。
    icon: 🌐
  - title: TypeScript 優先
    details: 為每個 CSS 屬性與自訂設定提供完整的自動完成與型別檢查。
    icon: 🤖
translation:
  sourceFile: docs/index.md
  sourceCommit: 36ab046b5f27060274a79d160c9b43606652d780
  sourceBlob: 6d210f5f8070ef39424e5deed5bb406d3cda908f
---

## 直接看程式碼 {#show-me-the-code}

用單純的 CSS 屬性名稱撰寫樣式，在建置時期得到 atomic CSS：

::: code-group

<<< @/zh-tw/.examples/getting-started/basic.example.pikain.ts [輸入]

<<< @/zh-tw/.examples/getting-started/basic.example.pikaout.css [輸出]

:::

想試試看嗎？[開始使用](/zh-tw/getting-started/what-is-pikacss)，或打開 [playground](https://pikacss.github.io/playground/)，不需要安裝任何東西。

從其他工具轉過來嗎？看看 [PikaCSS 與其他工具的比較](/zh-tw/getting-started/comparison)，包含 UnoCSS、Tailwind CSS、Panda CSS 與 vanilla-extract。
