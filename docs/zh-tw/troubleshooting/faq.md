---
title: FAQ
description: 關於 PikaCSS 的常見問題與疑難排解訣竅。
relatedPackages:
  - '@pikacss/core'
  - '@pikacss/unplugin-pikacss'
  - '@pikacss/nuxt-pikacss'
  - '@pikacss/eslint-config'
relatedSources:
  - packages/core/src/engine.ts
  - packages/core/src/types/engine.ts
  - packages/core/src/plugins/selectors.ts
  - packages/integration/src/ctx.ts
  - packages/integration/src/ctx.transform-utils.ts
  - packages/integration/src/generatedState.ts
  - packages/unplugin/src/index.ts
  - packages/unplugin/src/types.ts
  - packages/nuxt/src/index.ts
  - packages/eslint-config/src/rules/static-usage.ts
  - packages/plugin-typography/src/index.ts
  - packages/plugin-typography/package.json
category: troubleshooting
order: 10
translation:
  sourceFile: docs/troubleshooting/faq.md
  sourceCommit: d31fb8dd7cf1fae89d4b13d9a61b9fb792016a2c
  sourceBlob: 7c20a37df41ca8e607da00459c5894da10b04a31
---

# FAQ {#faq}

PikaCSS 的常見問題與解決方法。

## 為什麼我的樣式沒有出現？ {#why-are-my-styles-not-appearing}

請確認你的應用程式進入點有匯入產生出來的 CSS 模組：

```ts
// main.ts
import 'pika.css'
```

`import 'pika.css'` 會解析到目前這次執行產生的執行階段 CSS，它以 PikaCSS 內部狀態的形式放在專案根目錄的 `.pikacss/` 底下。這個位置無法設定，而且每一個開發伺服器或建置執行都擁有自己的檔案。

如果你使用的是 Nuxt 模組，這個匯入會自動注入。若使用一般的 unplugin 整合，請確認你有自己加上這行匯入，而且外掛已在你的建置設定中註冊。

## `ReferenceError: pika is not defined` {#referenceerror-pika-is-not-defined}

這個執行階段錯誤代表有個 `pika()` 呼叫沒有經過轉換就到了瀏覽器：`pika` 只存在於編譯時期，並沒有任何執行階段的匯出。最常見的原因是 scan glob 沒有比對到這個檔案，所以外掛從未處理它。預設的 `scan.include` 是 `**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,vue}`，而預設的 `scan.exclude` 會略過 `node_modules`、`dist`、`.git`、`.nuxt`、`.output`，以及 `coverage`。

修正方式：

1. 如果你設定了自訂的 `scan.include`，請確認它仍然能比對到該檔案：自訂值會原封不動地取代預設值，而不是加以擴充。預設的 glob 已經涵蓋轉換所支援的每一種副檔名（JS 家族加上 Vue SFC），其他副檔名即使加進去也無法轉換。
2. 檢查該檔案是否位於被排除的路徑底下（`node_modules`、`dist`、`.git`、`.nuxt`、`.output`、`coverage`）。如果你設定了自訂的 `scan.exclude`，請確認它不會不小心比對到該檔案。
3. 確認 PikaCSS 外掛確實已在你的建置設定中註冊。

## `Cannot find name 'pika'` {#cannot-find-name-pika}

這個 TypeScript 錯誤代表 `<stateDir>/pika.gen.ts` 尚未產生，或沒有被納入 TypeScript program。獨立執行 editor/typecheck/ESLint 前先跑 `pikacss prepare`，再把 `.pikacss/pika.gen.ts`（或你設定的 `stateDir`）納入 TypeScript project。

Typegen永遠屬於整個 PikaCSS generated state，不能單獨搬移或停用。見 [Generated state](/zh-tw/getting-started/setup#generated-state)。

## 為什麼 `static-usage` 會回報 ESLint 錯誤？ {#why-does-static-usage-report-an-eslint-error}

`pikacss/static-usage` 會讀取 canonical project config，檢查 configured roots 的 bounded-static argument grammar、static-extension語法、scan ownership，以及跨 entry root dependency。若同名 root在 lexical scope中被本地宣告遮蔽，就會當成一般 application code。

Runtime value請拆成不同的合法 `pika()` call，再由一般 JavaScript決定使用哪一個結果：

```ts
// ❌ 無效：runtime conditional直接出現在 Pika argument
pika(isDark ? { color: 'white' } : { color: 'black' })

// ✅ 有效：分開產生靜態 class
const className = isDark
  ? pika({ color: 'white' })
  : pika({ color: 'black' })
```

## 我要怎麼改變 layer 順序？ {#how-do-i-change-the-layer-order}

在你的引擎設定裡定義一個自訂的 `layers` map。數字越小，越早渲染：

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  engine: {
  layers: {
    reset: -1,
    preflights: 1,
    components: 5,
    utilities: 10,
  },
  },
})
```

完整範例請見 [Layers](/zh-tw/customizations/layers)。

## 我可以不用建置外掛就使用 PikaCSS 嗎？ {#can-i-use-pikacss-without-a-build-plugin}

可以。`@pikacss/core` 不需要打包工具的外掛也能運作。建立一個引擎，用 `await engine.use(...)` 註冊樣式，接著從 layer 宣告、preflight，以及原子樣式組合出 CSS 輸出：

<<< @/zh-tw/.examples/troubleshooting/without-build-plugin.example.ts#example

unplugin 整合會加上 HMR 與靜態擷取，但並非必要。Nuxt 模組也會自動注入 CSS 匯入，而一般的 unplugin 整合仍然預期你要自己加上 `import 'pika.css'`。

## 我要如何加入自訂的偽類（pseudo-class）或斷點？ {#how-do-i-add-a-custom-pseudo-class-or-breakpoint}

使用 `selectors` 設定屬性來註冊自訂選擇器，包含偽類與媒體查詢的 RWD 斷點：

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  engine: {
  selectors: {
    definitions: [
      { name: '@dark', value: 'html.dark $' },
      { name: '@sm', value: '@media (min-width: 640px)' },
    ],
  },
  },
})
```

請見 [選擇器](/zh-tw/customizations/selectors)。

## TypeScript 找不到外掛的模組擴增 {#typescript-cannot-find-module-augmentations-from-a-plugin}

請確認外掛套件已安裝，而且你的 `tsconfig.json` 使用了現代的模組解析模式，例如 `moduleResolution: 'bundler'` 或 `'node16'`，這樣 TypeScript 才能沿著外掛套件的 export map 找到它的宣告檔，以及 `@pikacss/core` 的模組擴增：

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler"
  }
}
```

## 開發時樣式沒有更新（HMR） {#styles-are-not-updating-during-development-hmr}

PikaCSS 的 Vite 外掛會自動處理 HMR。如果樣式沒有更新：

1. 確認外掛已用 `PikaCSS()` 在 `vite.config.ts` 中註冊。
2. 檢查你的進入點檔案裡有 `import 'pika.css'`。
3. 變更 `pika.config.ts` 應該會自動觸發設定重新載入。如果沒有，請確認你編輯的是解析後的設定檔路徑，而且存檔的內容確實有變更。

## 我要如何有條件地組合 PikaCSS class？ {#how-do-i-combine-pikacss-classes-conditionally}

預設情況下，轉換後的 `pika()` 呼叫會產生一個單純的 class 名稱字串，所以標準的 JavaScript 組合方式都能運作：

```ts
const base = pika({ display: 'flex', padding: '1rem' })
const active = pika({ color: 'blue' })
const inactive = pika({ color: 'gray' })

const className = `${base} ${isActive ? active : inactive}`
```

若 owning project entry設定 `transformedFormat: 'array'`，configured base `pika()` 就會回傳陣列。沒有 per-call `.arr()` override；請直接用 framework慣用的 array class handling組合結果。

## PikaCSS 能搭配 SSR／SSG 運作嗎？ {#does-pikacss-work-with-ssr-ssg}

可以。所有樣式都會在建置時期擷取到同一份產生出來的靜態樣式表，而且每一次 `pika()` 呼叫都會替換成單純的 class 名稱字串，完全沒有執行階段的樣式注入。伺服器端渲染、靜態產生，以及串流都不需要特殊處理：伺服器只要提供同一份靜態樣式表即可。Nuxt 模組會透過註冊 Vite 外掛，並經由一個產生出來的 Nuxt 外掛匯入 `pika.css`，自動把這一切接起來。

## 我應該提交產生的檔案嗎？ {#should-i-commit-the-generated-files}

整個 `.pikacss/` generated-state directory都可以重建，通常直接 ignore。若 CI 在 build前就跑 type-aware tooling，先執行 `pikacss prepare` 產生 `.pikacss/pika.gen.ts`。見 [Generated state](/zh-tw/getting-started/setup#generated-state)。

## 下一步 {#next}

- [快速開始](/zh-tw/getting-started/what-is-pikacss)：從頭開始。
- [API 參考](/api/)：完整的 API 細節。
