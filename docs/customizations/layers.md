---
title: Layers
description: Control CSS cascade ordering with @layer declarations in PikaCSS.
relatedPackages:
  - '@pikacss/core'
relatedSources:
  - 'packages/core/src/engine.ts'
category: customizations
order: 10
---

# Layers

PikaCSS uses CSS `@layer` to establish cascade ordering between preflight styles and utility classes.

CSS layers provide explicit control over the cascade order. PikaCSS generates a `@layer` declaration at the top of the CSS output so that preflights always come before utilities, and custom layers can be inserted at any priority level.

By default, PikaCSS creates two layers: `preflights` (priority 1) and `utilities` (priority 10). Lower numbers render earlier in the layer order.

## Config

Configure layers via `layers` in the engine config:

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  engine: {
  layers: {
    reset: -1, // before preflights
    preflights: 1, // default
    components: 5, // between preflights and utilities
    utilities: 10, // default
  },
  },
})
```

Use the `__layer` meta-property in a style definition to assign styles to a specific layer:

```ts
pika({
  __layer: 'components',
  display: 'flex',
  padding: '1rem',
})
```

Related config options:

- `defaultPreflightsLayer` — the layer for unlayered preflights (default: `'preflights'`).
- `defaultUtilitiesLayer` — the fallback layer for utility styles (default: `'utilities'`).

## Examples

::: code-group

<<< @/.examples/customizations/layers.example.pikain.ts [Input]

<<< @/.examples/customizations/layers.example.pikaout.css [Output]

:::

## Next

- [Important](/customizations/important) — add `!important` to all styles.
- [Preflights](/customizations/preflights) — inject base CSS before utilities.
