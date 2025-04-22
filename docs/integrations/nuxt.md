---
title: Nuxt Module
description: The Nuxt Module for PikaCSS (@pikacss/nuxt-pikacss).
outline: deep
---

# Nuxt Module

## Installation

::: code-group

```bash [pnpm]
pnpm add -D @pikacss/nuxt-pikacss
```

```bash [yarn]
yarn add -D @pikacss/nuxt-pikacss
```

```bash [npm]
npm install -D @pikacss/nuxt-pikacss
```

:::

Install the module:

```ts [nuxt.config.ts]
export default defineNuxtConfig({
	modules: [
		'@pikacss/nuxt-pikacss',
	],

	pikacss: {
		// ...nuxt module options
	},
})
```

Create a `pika.config.ts` file:

```ts [pika.config.ts]
import { defineEngineConfig } from '@pikacss/nuxt-pikacss'

export default defineEngineConfig({
	// ...PikaCSS Engine options
})
```
