---
title: Define Helpers
description: Define helpers for type-safe PikaCSS configuration and plugin authoring.
relatedPackages:
  - '@pikacss/core'
relatedSources:
  - 'packages/core/src/index.ts'
  - 'packages/core/src/plugin.ts'
  - 'packages/core/src/types/public.ts'
  - 'packages/core/src/plugins/variables.ts'
category: plugin-development
order: 40
---

# Define Helpers

PikaCSS keeps Core define helpers only for the two places where they materially improve low-level authoring ergonomics: `EngineConfig` values and plugin definitions. Application `pika.config.*` files still use the canonical `defineConfig()` surface from the directly installed outer package.

## defineEnginePlugin

Returns the given plugin definition with full type inference for hook signatures.

```ts
import { defineEnginePlugin } from '@pikacss/core'

const plugin = defineEnginePlugin({
  name: 'my-plugin',
  configureEngine: async (engine) => {
    // fully typed engine parameter
  },
})
```

## defineEngineConfig

Returns the given engine configuration with full type inference for all config fields. Use it for low-level Engine/plugin code or to prepare a typed value for a project's `engine` field; it is **not** the default-export root of `pika.config.*`.

```ts
import { defineEngineConfig } from '@pikacss/core'

const engineConfig = defineEngineConfig({
  prefix: 'pk-',
  plugins: [],
  layers: { base: 0, utilities: 1 },
})
```

For an application project, place that value under the canonical project config:

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({ engine: engineConfig })
```

For other typed shapes such as reusable style objects, preflights, keyframes, selectors, shortcuts, or variables definitions, use plain object literals with `satisfies` or an explicit type annotation.

```ts
import type { StyleDefinition, VariablesDefinition } from '@pikacss/core'

const card: StyleDefinition = {
  display: 'flex',
  '$:hover': { opacity: '0.8' },
}

const theme = {
  ':root': {
    '--color-primary': { value: '#3b82f6' },
    '--spacing-md': { value: '1rem' },
  },
} satisfies VariablesDefinition
```

## Next

- [Create a Plugin](/plugin-development/create-a-plugin) — get started with plugin development.
- [API Reference](/api/) — full API documentation.
