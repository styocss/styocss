---
title: Preflights
description: Inject base CSS styles before utility classes in PikaCSS.
relatedPackages:
  - '@pikacss/core'
relatedSources:
  - 'packages/core/src/engine.ts'
  - 'packages/core/src/types/public.ts'
category: customizations
order: 30
---

# Preflights

Inject base styles that render before utility classes.

Preflights are CSS rules injected at the top of the generated stylesheet, inside the `preflights` layer by default. Use them for CSS resets, global styles, font-face declarations, or any CSS that should appear before atomic utility classes.

A preflight entry can be:

- A raw CSS string
- A structured definition object (key-value CSS properties)
- A function `(engine, isFormatted, ctx) => ...` (sync or async) that returns CSS text or a definition object

## Config

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  engine: {
  // Required for the `layer: 'base'` preflight below
  layers: { base: 0 },

  preflights: [
    // Raw CSS string
    '*, *::before, *::after { box-sizing: border-box; }',

    // Structured definition
    {
      body: {
        margin: '0',
        fontFamily: 'system-ui, sans-serif',
      },
    },

    // With layer assignment
    {
      layer: 'base',
      preflight: 'html { line-height: 1.5; }',
    },

    // Async factory function
    async (engine, isFormatted, ctx) => {
      return '/* dynamic preflight */'
    },
  ],
  },
})
```

::: warning Layered preflights need a registered layer
A preflight wrapped with `layer` must have that layer registered in `config.layers` (the example above registers `base` at order `0`, before the default `preflights: 1` and `utilities: 10`). An unregistered layer is left out of the generated `@layer` order declaration, and per CSS `@layer` semantics it would then be ordered *after* all declared layers — base styles would override your utilities.
:::

Preflight functions receive a third `ctx` argument during a `renderPreflights` pass. A preflight that invokes other preflights must forward it to `engine.invokePreflight(fn, isFormatted, ctx)` so each preflight function still runs exactly once per render pass.

## Examples

<<< @/.examples/customizations/preflights.example.ts

## Next

- [Variables](/customizations/variables) — define CSS custom properties.
- [Layers](/customizations/layers) — control preflight layer ordering.
