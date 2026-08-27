---
title: Shortcuts
description: Define reusable object-form style-item aliases and dynamic shortcut families.
relatedPackages:
  - '@pikacss/core'
relatedSources:
  - 'packages/core/src/plugins/shortcuts.ts'
category: customizations
order: 70
---

# Shortcuts

Shortcuts are named reusable `StyleItem` sequences. They are ordinary string style items when consumed by `pika()`.

## Static shortcuts

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  engine: {
  shortcuts: {
    definitions: [
      {
        name: 'flex-center',
        value: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
      },
      {
        name: 'btn',
        value: {
          'padding': '0.5rem 1rem',
          'borderRadius': '0.25rem',
          '$:hover': { opacity: '0.8' },
        },
      },
      {
        name: 'btn-primary',
        value: ['btn', { backgroundColor: 'royalblue', color: 'white' }],
      },
    ],
  },
  },
})
```

`value` accepts one style item or an array of style items. Array composition replaces the removed `__shortcut` pseudo-property.

Use shortcuts directly:

```ts
pika('flex-center')
pika('btn-primary', { marginTop: '1rem' })
```

## Dynamic shortcuts

```ts
export default defineConfig({
  engine: {
  shortcuts: {
    definitions: [
      {
        pattern: /^size-(.+)$/,
        inputType: '`size-${string}`',
        resolve: ([, size]) => ({ width: size, height: size }),
        autocomplete: ['size-1rem', 'size-2rem'],
      },
    ],
  },
  },
})
```

The explicit `inputType` describes the accepted TypeScript input family. `autocomplete` contributes deterministic concrete members and resolved hover documentation; runtime source usage does not mutate Typegen.

## Examples

<<< @/.examples/customizations/shortcuts.example.ts

## Next

- [Autocomplete](/customizations/autocomplete)
- [Selectors](/customizations/selectors)
