---
title: Vite Plugin
description: The Vite plugin for StyoCSS (@styocss/vite-plugin-styocss).
outline: deep
---

# Vite Plugin

## Installation

::: code-group

```bash [pnpm]
pnpm add -D @styocss/vite-plugin-styocss
```

```bash [yarn]
yarn add -D @styocss/vite-plugin-styocss
```

```bash [npm]
npm install -D @styocss/vite-plugin-styocss
```

:::

Install the plugin:

```ts [vite.config.ts]
import StyoCSS from '@styocss/vite-plugin-styocss'
import { defineConfig } from 'vite'

export default defineConfig({
	plugins: [
		StyoCSS({
			// ...vite plugin options
		}),
	],
})
```

Create a `styo.config.ts` file:

```ts [styo.config.ts]
import { defineEngineConfig } from '@styocss/vite-plugin-styocss'

export default defineEngineConfig({
	// ...StyoCSS Engine options
})
```

Add `virtual:styo.css` to your main entry:

```ts [main.ts]
import 'virtual:styo.css'
```
