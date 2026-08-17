---
title: SSR 與正式環境
description: 為什麼伺服器端渲染不需要任何特殊處理，以及在開發與正式環境建置中可以對 PikaCSS 有什麼預期。
relatedPackages:
  - '@pikacss/unplugin-pikacss'
  - '@pikacss/integration'
  - '@pikacss/nuxt-pikacss'
relatedSources:
  - packages/unplugin/src/index.ts
  - packages/integration/src/ctx.ts
  - packages/nuxt/src/index.ts
category: integrations
order: 24
translation:
  sourceFile: docs/integrations/ssr-and-production.md
  sourceCommit: 302211f67bc1b93edd43e5ec8ca97c39fd91d238
  sourceBlob: f1153951ec01628d2beaaf729348ecb94fecc235
---

# SSR 與正式環境 {#ssr-production}

PikaCSS 的輸出是一個在建置時期產生的靜態 CSS 檔案。光是這一點，就回答了大多數關於 SSR 與正式環境的問題。

## SSR、SSG 與串流都能直接運作 {#ssr-ssg-and-streaming-just-work}

這裡沒有執行階段的樣式注入，也沒有需要清空的 style registry：

- 每一次 `pika()` 呼叫都會在建置期間替換成 class 名稱的字串常值；元件在伺服器上會直接渲染成純字串，就和在瀏覽器裡一樣。
- 所有產生出來的樣式都放在目前這次執行擁有的同一個執行階段 CSS 檔案裡（PikaCSS 的內部狀態，位於 `.pikacss/` 底下）。`import 'pika.css'` 這個 specifier 會解析到該檔案，而你的打包工具會像處理其他任何樣式表匯入一樣處理它。

因此，伺服器端渲染、靜態網站產生，以及串流回應都不需要 PikaCSS 特有的處理：只要你的環境能提供一般匯入的樣式表，就能提供 PikaCSS。這裡沒有 `extractCriticalToChunks`、沒有 `ServerStyleSheet`，也不會有任何由樣式造成的 hydration 不一致問題。

至於 Nuxt，`@pikacss/nuxt-pikacss` 模組會註冊一個 Nuxt 外掛範本，它唯一的工作就是 `import "pika.css"`，除此之外不會往伺服器或用戶端的執行環境加入任何東西。詳情請見 [Nuxt](/zh-tw/integrations/nuxt)。

## 正式環境建置 {#production-builds}

在建置模式下，外掛會先一次掃描所有符合 `scan.include` 的檔案，收集每一處 `pika()` 的使用，並在打包繼續進行之前寫出完整的 CSS 檔案。輸出內容包含：

- `@layer` 順序宣告，
- preflight（已剔除未使用的變數與關鍵影格），
- 去除重複後的原子 class，其大小取決於不重複的宣告數量，而非呼叫位置的數量（詳情請見 [PikaCSS 如何產生 CSS](/zh-tw/getting-started/how-pikacss-generates-css)）。

結果會經過你打包工具正常的 CSS 流程（壓縮、雜湊，以及程式碼分割），PikaCSS 不會對它做任何更動。

## 開發時什麼會觸發重新載入 {#what-triggers-a-reload-in-dev}

開發伺服器會在以下情況重新建立引擎（並重新產生兩個輸出檔案）：

- **設定檔變更時。** PikaCSS 會監看解析後的 `pika.config.*` 檔案。只有*內容*變更才算——沒有實際編輯就存檔，或是變更後位元組完全相同，都會被忽略。
- **設定相依（config dependency）變更時。** 會載入外部檔案的外掛，會透過 `engine.addConfigDependency(path)` 註冊這些檔案，例如 [@pikacss/plugin-design-tokens](/zh-tw/official-plugins/design-tokens) 會註冊它的 token 來源檔案。這些路徑的監看方式和設定檔相同，包含內容比對在內。註冊不限於 setup 階段：執行中期才發現的相依（例如[可監看的 icon collection](/zh-tw/official-plugins/icons#watchable-custom-collections) 在模組轉換時解析到的後備檔案）會立即推送給運行中的 Vite watcher，其他 bundler 則在下一次 transform 時加入監看。

這兩條路徑都仰賴打包工具的檔案監看器（esbuild 是例外，它沒有以監看為基礎的重新載入路徑）。一般的原始碼編輯不會重新建立引擎，只會新增或更新受影響檔案的使用情形，而產生出來的 CSS 只有在解析後的樣式真的變更時才會重新寫出。`pika.gen.ts` 則完全不會因原始碼編輯而重新產生：產生出來的宣告是有效引擎／型別設定的決定性投影，只有在真正的型別層輸入變更時（設定重新載入、外掛提供的自動完成等）才會重新產生。

**重新建立引擎會觸發整頁重新載入，而不是 HMR 更新**（Vite）。原子 class 名稱是依照被發現的順序指派的，所以全新的引擎可能把同一個名稱交給不同的宣告。此時瀏覽器手上任何屬於前一代的內容都會指向錯誤的規則——而且是無聲無息、不會有任何錯誤——因此 PikaCSS 會重新載入頁面，確保供應出去的模組與重新產生的 CSS 屬於同一代。編輯設定時請預期頁面狀態（表單輸入、路由位置）會遺失。

設定檔無法成功執行時是例外：開發伺服器會保留上一份正常運作的引擎，因此不會有任何名稱被重新指派，頁面也不會被動到。修好檔案再存檔一次即可套用。

## 型別層級的效能 {#type-level-performance}

產生出來的 `pika.gen.ts` 大小（自動完成的聯集型別）會隨著你的專案成長。TypeScript 型別系統的成本，會由一套位於儲存庫內的基準測試工具（`scripts/type-bench/`）追蹤，它會測量不同使用規模與 TS 版本下的檢查時間、型別具現化的數量，以及 IDE 延遲，因此型別效能的退步是實際測量出來的，而不是用猜的。我們沒有公布任何絕對數字，因為這些數字高度取決於專案的形態與硬體。

## 下一步 {#next}

- [PikaCSS 如何產生 CSS](/zh-tw/getting-started/how-pikacss-generates-css)：輸出檔案背後的執行模型。
- [Unplugin](/zh-tw/integrations/unplugin)：包含 `scan` 與 `tsCodegen` 的建置工具選項。
- [Nuxt](/zh-tw/integrations/nuxt)：Nuxt 模組的自動接線。
