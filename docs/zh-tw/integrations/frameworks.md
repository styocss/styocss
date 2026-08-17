---
title: 框架
description: 把 PikaCSS 接入 Vue、React，以及 Solid 元件。
relatedPackages:
  - '@pikacss/unplugin-pikacss'
  - '@pikacss/integration'
relatedSources:
  - playground/src/templates/vue-ts/vite.config.ts
  - playground/src/templates/react-ts/vite.config.ts
  - playground/src/templates/solid-ts/vite.config.ts
  - packages/integration/src/tsCodegen.ts
  - packages/integration/src/ctx.transform-utils.ts
category: integrations
order: 22
translation:
  sourceFile: docs/integrations/frameworks.md
  sourceCommit: d31fb8dd7cf1fae89d4b13d9a61b9fb792016a2c
  sourceBlob: 18f89bb3c18e68a2f44b72925d8c1b17cded864a
---

# 框架 {#frameworks}

PikaCSS 與框架無關：`pika()` 會回傳一個 class 名稱字串，所以唯一和框架相關的部分，就是由哪個屬性來接收它。下面的程式碼片段對應 [Playground](https://pikacss.github.io/playground/) 範本，它們是各個框架都能實際運作的專案。

以下兩條規則適用於所有情況：

- `pika` 是由建置外掛提供的**全域變數**，不要匯入它。
- 在你的進入點檔案裡匯入產生出來的樣式表一次：`import 'pika.css'`。

::: tip 提示
這些範本會把 `tsCodegen` 指向 `src/`，這樣一來，一份帶有 `"include": ["src"]`、未經修改的 `tsconfig` 就會自動抓到產生出來的 `pika.gen.ts` 宣告。
:::

## Vue {#vue}

請在 Vue 外掛之前註冊 PikaCSS 外掛（這個外掛同時宣告了 `enforce: 'pre'`，所以無論如何 PikaCSS 的轉換都會在 Vue 編譯器之前執行）：

```ts
// vite.config.ts
import pikacss from '@pikacss/unplugin-pikacss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
	plugins: [
		pikacss({
			tsCodegen: './src/pika.gen.ts',
		}),
		vue(),
	],
})
```

把結果綁定到 `:class`。在 `<template>` 裡可以直接呼叫；當安裝了 Vue 時，產生出來的 `pika.gen.ts` 也會擴增 Vue 的 `ComponentCustomProperties`，所以 `pika` 在樣板裡同樣具備型別：

```vue
<!-- App.vue -->
<script setup lang="ts">
import { ref } from 'vue'

const count = ref(0)
</script>

<template>
	<button
		type="button"
		:class="pika({
			'padding': '0.625rem 1.25rem',
			'borderRadius': '0.75rem',
			'cursor': 'pointer',
			'$:hover': { filter: 'brightness(1.1)' },
		})"
		@click="count++"
	>
		count is {{ count }}
	</button>
</template>
```

進入點檔案：

```ts
// main.ts
import { createApp } from 'vue'
import 'pika.css'
import App from './App.vue'

createApp(App).mount('#app')
```

## React {#react}

```ts
// vite.config.ts
import pikacss from '@pikacss/unplugin-pikacss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
	plugins: [
		pikacss({
			tsCodegen: './src/pika.gen.ts',
		}),
		react(),
	],
})
```

React 使用 `className`：

```tsx
// App.tsx
function App() {
	return (
		<button
			type="button"
			className={pika({
				'padding': '0.625rem 1.25rem',
				'borderRadius': '0.75rem',
				'cursor': 'pointer',
				'$:hover': { filter: 'brightness(1.1)' },
			})}
		>
			Click me
		</button>
	)
}

export default App
```

進入點檔案：

```tsx
// main.tsx
import { createRoot } from 'react-dom/client'
import 'pika.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(<App />)
```

## Solid {#solid}

```ts
// vite.config.ts
import pikacss from '@pikacss/unplugin-pikacss/vite'
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
	plugins: [
		pikacss({
			tsCodegen: './src/pika.gen.ts',
		}),
		solid(),
	],
})
```

Solid 使用 `class`。shortcut 參考可以在同一次呼叫中與行內定義組合：

```tsx
// App.tsx
function App() {
	return (
		<section class={pika('card', { maxWidth: '28rem', textAlign: 'center' })}>
			<button type="button" class={pika('btn')}>
				Click me
			</button>
		</section>
	)
}

export default App
```

進入點檔案：

```tsx
// index.tsx
import { render } from 'solid-js/web'
import 'pika.css'
import App from './App.tsx'

render(() => <App />, document.getElementById('root')!)
```

## Nuxt {#nuxt}

請使用專用的模組，而不要自己接上 Vite 外掛：它會註冊外掛並自動匯入 `pika.css`。詳情請見 [Nuxt](/zh-tw/integrations/nuxt)。

## 支援的檔案類型 {#supported-file-types}

這個轉換支援 JavaScript 家族的原始碼（`.js`、`.mjs`、`.cjs`、`.jsx`、`.ts`、`.mts`、`.cts`、`.tsx`）以及 Vue 單一檔案元件（`.vue`）。其他標記格式（Svelte、Astro、純 HTML）則不在處理範圍內。掃描選項請見 [Unplugin](/zh-tw/integrations/unplugin)。

## 下一步 {#next}

- [安裝與設定](/zh-tw/getting-started/setup)：安裝流程與產生的檔案導覽。
- [SSR 與正式環境](/zh-tw/integrations/ssr-and-production)：伺服器渲染與建置行為。
- [Unplugin](/zh-tw/integrations/unplugin)：所有外掛選項與其他建置工具。
