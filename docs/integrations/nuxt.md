---
title: Nuxt Module
description: The Nuxt Module for StyoCSS (@styocss/nuxt-styocss).
outline: deep
---

# Nuxt Module

## Installation

::: code-group

```bash [pnpm]
pnpm add -D @styocss/nuxt-styocss
```

```bash [yarn]
yarn add -D @styocss/nuxt-styocss
```

```bash [npm]
npm install -D @styocss/nuxt-styocss
```

:::

Install the module:

```ts [nuxt.config.ts]
export default defineNuxtConfig({
	modules: [
		'@styocss/nuxt-styocss',
	],

	styocss: {
		// ...nuxt module options
	},
})
```

Create a `styo.config.ts` file:

```ts [styo.config.ts]
import { defineEngineConfig } from '@styocss/nuxt-styocss'

export default defineEngineConfig({
	// ...StyoCSS Engine options
})
```
