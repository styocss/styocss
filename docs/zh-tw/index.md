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
    icon: "\U0001F9EC"
  - title: 完全可自訂
    details: 選擇器、shortcut、變數、關鍵影格，以及強大的外掛系統。
    icon: "\U0001F527"
  - title: 不綁定框架
    details: 支援 Vite、Rollup、Rolldown、Webpack、Rspack 與 Nuxt。
    icon: "\U0001F310"
  - title: TypeScript 優先
    details: 為每個 CSS 屬性與自訂設定提供完整的自動完成與型別檢查。
    icon: "\U0001F916"
translation:
  sourceFile: docs/index.md
  sourceCommit: 33431c15728d378cc7bd9c37fd5c3b3e86e51318
  sourceBlob: cac7d8cc8032a7a48c6799eee40ba38207e023c9
---

## 直接看程式碼 {#show-me-the-code}

用單純的 CSS 屬性名稱撰寫樣式，在建置時期得到 atomic CSS：

::: code-group

<<< @/zh-tw/.examples/getting-started/basic.example.pikain.ts [輸入]

<<< @/zh-tw/.examples/getting-started/basic.example.pikaout.css [輸出]

:::

想試試看嗎？[開始使用](/zh-tw/getting-started/what-is-pikacss)，或打開 [playground](https://pikacss.github.io/playground/)，不需要安裝任何東西。

從其他工具轉過來嗎？看看 [PikaCSS 與其他工具的比較](/zh-tw/getting-started/comparison)，包含 UnoCSS、Tailwind CSS、Panda CSS 與 vanilla-extract。
