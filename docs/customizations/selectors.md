---
title: Selectors
description: Define object-form static and dynamic selector semantics.
relatedPackages:
  - '@pikacss/core'
relatedSources:
  - 'packages/core/src/plugins/selectors.ts'
category: customizations
order: 60
---

# Selectors

Custom selectors map authoring names to nested CSS selector output. Definitions use one object-only grammar.

## Static selectors

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  engine: {
  selectors: {
    definitions: [
      { name: '@dark', value: 'html.dark $' },
      { name: '@light', value: 'html:not(.dark) $' },
      { name: '@sm', value: '@media (min-width: 640px)' },
    ],
  },
  },
})
```

`$` is replaced with the current generated atomic selector where applicable.

## Dynamic selectors

Dynamic definitions require both a runtime pattern and an explicit raw TypeScript `inputType` for the accepted authoring domain:

```ts
export default defineConfig({
  engine: {
  selectors: {
    definitions: [
      {
        pattern: /^@container-(.+)$/,
        inputType: '`@container-${string}`',
        resolve: ([, name]) => `@container ${name}`,
        autocomplete: ['@container-card', '@container-sidebar'],
        description: 'Named container query',
      },
    ],
  },
  },
})
```

`autocomplete` lists concrete configured members for Typegen/editor discovery. It does not learn new members from runtime source hits. Invalid autocomplete entries that do not match the rule's pattern are diagnosed and excluded.

Use selectors as nested style keys:

```ts
pika({
  'color': 'black',
  '@dark': { color: 'white' },
  '@sm': { fontSize: '14px' },
})
```

A selector value may itself be a `StyleItem[]`, so nested shortcut composition is legal.

## Examples

<<< @/.examples/customizations/selectors.example.ts

## Next

- [Shortcuts](/customizations/shortcuts)
- [Variables](/customizations/variables)
