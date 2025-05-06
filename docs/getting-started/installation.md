---
title: Installation
description: Learn how to install PikaCSS in your project using Vite or Nuxt3, and understand the auto-generated files created by PikaCSS.
outline: deep
---

# Installation

## Vite

1. ### Install the vite plugin
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

2. ### Apply the vite plugin

```ts [vite.config.ts]
import PikaCSS from '@pikacss/vite-plugin-pikacss'
import { defineConfig } from 'vite'

export default defineConfig({
	plugins: [
		PikaCSS({ /* ...vite plugin options */ }),
	],
})
```

3. ### Import the virtual module
```ts [main.ts]
import 'virtual:pika.css'
```

## Nuxt3

1. ### Install the nuxt module

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

2. ### Apply the nuxt module

```ts [nuxt.config.ts]
export default defineNuxtConfig({
	modules: [
		'@pikacss/nuxt-pikacss',
	],

	pikacss: { /* ...nuxt module options */ },
})
```

## Auto Generated Files
- `pika.config.js` - The configuration file for PikaCSS engine, only generated once if there is no config file found or any inline config.
- `pika.dev.css` - The generated CSS file containing all the styles used in your project. This file is generated during development and is not intended for production use.
- `pika.gen.ts` - The generated TypeScript file containing type definitions and utility functions for PikaCSS.

> Feel free to add `pika.dev.css` and `pika.gen.ts` to your `.gitignore` file, as they are auto-generated files and should not be committed to your version control system.
