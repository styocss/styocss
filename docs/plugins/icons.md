---
title: Icons
description: Learn how to use icons plugin in PikaCSS
outline: deep
---

# Icons

::: info
Big thanks to [unocss](https://github.com/unocss/unocss) for the icons preset that this plugin is based on. This icons plugin is a wrapper around it to adapt it to PikaCSS.

Check the [documentation](https://unocss.dev/presets/icons) for more information about the icons available and how to use them.
:::

## Installation
::: code-group

```bash [pnpm]
pnpm add -D @pikacss/plugin-icons
```

```bash [yarn]
yarn add -D @pikacss/plugin-icons
```

```bash [npm]
npm install -D @pikacss/plugin-icons
```

:::

## Setup

::: code-group

```ts  [Vite Project]
// pika.config.ts
import Icons from '@pikacss/plugin-icons'
import { defineEngineConfig } from '@pikacss/vite-plugin-pikacss'

export default defineEngineConfig({
	plugins: [
		Icons({
			// options
		}),
	],
})
```

```ts  [Nuxt Project]
// pika.config.ts
import { defineEngineConfig } from '@pikacss/nuxt-pikacss'
import Icons from '@pikacss/plugin-icons'

export default defineEngineConfig({
	plugins: [
		Icons({
			// options
		}),
	],
})
```

:::

## Usage

The icons would be provided as shortcuts, so you can use them like this:

```ts
pika('i-mdi:home')
```
