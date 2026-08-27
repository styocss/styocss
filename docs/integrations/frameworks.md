---
title: Frameworks
description: Wiring PikaCSS into Vue, React, and Solid components.
relatedPackages:
  - '@pikacss/unplugin-pikacss'
  - '@pikacss/integration'
relatedSources:
  - 'playground/src/templates/vue-ts/vite.config.ts'
  - 'playground/src/templates/react-ts/vite.config.ts'
  - 'playground/src/templates/solid-ts/vite.config.ts'
  - 'packages/integration/src/operations.ts'
  - 'packages/integration/src/ctx.pipeline.ts'
category: integrations
order: 22
---

# Frameworks

PikaCSS is framework-agnostic: the configured base `pika()` call is replaced with class-name data at build time. The default output is a string; an entry can opt into a string array with `transformedFormat: 'array'`. The snippets below use the default string form and mirror the [Playground](https://pikacss.github.io/playground/) templates.

Two rules apply everywhere:

- `pika` is a **global** provided by the build plugin — do not import it.
- Import the owning entry's logical `cssModule` where its styles are needed; `import 'pika.css'` is the single-entry default used by the examples below.

::: tip
Generic framework projects keep the generated declaration in PikaCSS generated state (`.pikacss/pika.gen.ts` by default). Run `pikacss prepare` before standalone TypeScript/ESLint/IDE tooling needs it, and include/reference that declaration from your TypeScript project, for example by adding `.pikacss/pika.gen.ts` to `tsconfig.json` `include`.
:::

## Vue

Register the PikaCSS plugin before the Vue plugin (the plugin also declares `enforce: 'pre'`, so PikaCSS transforms run before the Vue compiler either way):

```ts
// vite.config.ts
import pikacss from '@pikacss/unplugin-pikacss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
	plugins: [
		pikacss(),
		vue(),
	],
})
```

Bind the result to `:class`. Calls work directly inside `<template>` — when Vue is installed, the generated `pika.gen.ts` also augments Vue's `ComponentCustomProperties`, so `pika` is typed in templates too:

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

Entry file:

```ts
// main.ts
import { createApp } from 'vue'
import 'pika.css'
import App from './App.vue'

createApp(App).mount('#app')
```

## React

```ts
// vite.config.ts
import pikacss from '@pikacss/unplugin-pikacss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
	plugins: [
		pikacss(),
		react(),
	],
})
```

React uses `className`:

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

Entry file:

```tsx
// main.tsx
import { createRoot } from 'react-dom/client'
import 'pika.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(<App />)
```

## Solid

```ts
// vite.config.ts
import pikacss from '@pikacss/unplugin-pikacss/vite'
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
	plugins: [
		pikacss(),
		solid(),
	],
})
```

Solid uses `class`. Shortcut references compose with inline definitions in the same call:

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

Entry file:

```tsx
// index.tsx
import { render } from 'solid-js/web'
import 'pika.css'
import App from './App.tsx'

render(() => <App />, document.getElementById('root')!)
```

## Nuxt

Use the dedicated module instead of wiring the Vite adapter yourself. It registers the Vite adapter and prepares/references generated types through Nuxt’s type lifecycle. Single-entry authoring auto-imports its sole `cssModule`; explicit multi-entry authoring does not auto-import CSS. See [Nuxt](/integrations/nuxt).

## Supported File Types

The transform supports JavaScript-family sources (`.js`, `.mjs`, `.cjs`, `.jsx`, `.ts`, `.mts`, `.cts`, `.tsx`) and Vue single-file components (`.vue`). Other markup formats (Svelte, Astro, plain HTML) are not processed. Scan scope is configured per entry in the canonical PikaCSS project config; the adapter itself has no scan option.

## Next

- [Setup](/getting-started/setup) — install and generated-files walkthrough.
- [SSR & Production](/integrations/ssr-and-production) — server rendering and build behavior.
- [Unplugin](/integrations/unplugin) — supported bundler adapters and bootstrap selectors.
