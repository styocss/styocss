---
title: Keyframes
description: Define object-form CSS keyframes with generated authoring metadata.
relatedPackages:
  - '@pikacss/core'
relatedSources:
  - 'packages/core/src/plugins/keyframes.ts'
category: customizations
order: 50
---

# Keyframes

Keyframes use object definitions and are emitted only when needed unless pruning is disabled.

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  engine: {
  keyframes: {
    definitions: [
      {
        name: 'fade-in',
        frames: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
      {
        name: 'slide-in',
        frames: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        description: 'Slide from the left',
      },
    ],
  },
  },
})
```

Use a keyframe name in ordinary CSS properties:

```ts
pika({ animation: 'fade-in 0.3s ease-in-out' })
```

The subsystem also exposes configured keyframes through its static Pika authoring surface for supported compile-time composition. Runtime usage never mutates generated Typegen.

Set `pruneUnused: false` on a definition (or the keyframes config default) when an animation is consumed outside PikaCSS-generated CSS.

## Examples

<<< @/.examples/customizations/keyframes.example.ts

## Next

- [Variables](/customizations/variables)
- [Selectors](/customizations/selectors)
