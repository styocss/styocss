---
title: Vite Plugin
description: The Vite plugin for PikaCSS (@pikacss/vite-plugin-pikacss).
outline: deep
---

# Vite Plugin

## Installation

::: code-group

```bash [pnpm]
pnpm add -D @pikacss/vite-plugin-pikacss
```

```bash [yarn]
yarn add -D @pikacss/vite-plugin-pikacss
```

```bash [npm]
npm install -D @pikacss/vite-plugin-pikacss
```

:::

Install the plugin:

```ts [vite.config.ts]
import PikaCSS from '@pikacss/vite-plugin-pikacss'
import { defineConfig } from 'vite'

export default defineConfig({
	plugins: [
		PikaCSS({
			// ...vite plugin options
		}),
	],
})
```

Create a `pika.config.ts` file:

```ts [pika.config.ts]
import { defineEngineConfig } from '@pikacss/vite-plugin-pikacss'

export default defineEngineConfig({
	// ...PikaCSS Engine options
})
```

Add `virtual:pika.css` to your main entry:

```ts [main.ts]
import 'virtual:pika.css'
```
