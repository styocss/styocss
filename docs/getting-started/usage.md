---
title: Usage
description: Learn how to write styles with pika() and see common usage patterns.
relatedPackages:
  - '@pikacss/core'
relatedSources:
  - 'packages/core/src/engine.ts'
  - 'packages/core/src/types/public.ts'
  - 'packages/integration/src/ctx.ts'
  - 'packages/integration/src/tsCodegen.ts'
  - 'scripts/css-data/generate-csstype.ts'
category: getting-started
order: 30
---

# Usage

Write styles using CSS property names in JavaScript objects, and PikaCSS transforms them into atomic CSS at build time.

## Your First Styled Component

No configuration is needed beyond the [Setup](/getting-started/setup) steps — call the `pika` global directly in your component. Do not import it: the build plugin replaces every call at build time.

::: code-group

```vue [Vue]
<!-- App.vue -->
<script setup lang="ts">
const buttonClass = pika({
  padding: '0.5rem 1rem',
  border: 'none',
  borderRadius: '8px',
  backgroundColor: '#3b82f6',
  color: 'white',
  cursor: 'pointer',
  '$:hover': {
    backgroundColor: '#2563eb',
  },
})
</script>

<template>
  <button :class="buttonClass">Click me</button>
</template>
```

```tsx [React]
// Button.tsx
const buttonClass = pika({
  padding: '0.5rem 1rem',
  border: 'none',
  borderRadius: '8px',
  backgroundColor: '#3b82f6',
  color: 'white',
  cursor: 'pointer',
  '$:hover': {
    backgroundColor: '#2563eb',
  },
})

export function Button() {
  return <button className={buttonClass}>Click me</button>
}
```

:::

At build time the plugin replaces the `pika()` call with a plain string literal of the generated class names:

```ts
const buttonClass = 'pk-a pk-b pk-c pk-d pk-e pk-f pk-g'
```

Transformed calls always use single-quoted string literals, so the replacement stays valid even inside a double-quoted Vue template attribute such as `:class="pika({ ... })"`.

Each declaration becomes its own atomic class in the generated CSS (imported through `import 'pika.css'`):

<<< @/.examples/getting-started/first-component.example.pikaout.css [generated CSS]

## pika() Variants

PikaCSS provides several function variants for different output formats and use cases:

### pika()

The default function. Returns a space-separated string of atomic class names.

```ts
const className = pika({ color: 'red', fontSize: '16px' })
// → 'pk-a pk-b'
```

### pika.str()

Explicit string variant. Always returns a space-separated string of class names, even when the integration is configured with `transformedFormat: 'array'` — under the default `transformedFormat: 'string'` it behaves identically to `pika()`.

```ts
const className = pika.str({ color: 'red' })
// → 'pk-a'
```

### pika.arr()

Array variant. Returns an array of individual class name strings instead of a single joined string. Useful for frameworks or utilities that accept class name arrays.

```ts
const classNames = pika.arr({ color: 'red', fontSize: '16px' })
// → ['pk-a', 'pk-b']
```

::: tip
All variants accept the same arguments — they only differ in return type. The ESLint plugin validates all variants equally.
:::

## Examples

### Basic CSS Properties

Pass a style definition object with standard CSS properties:

::: info CSS numeric values
Write numeric-looking CSS values as CSS strings, such as `opacity: '0.5'` or `zIndex: '10'`. PikaCSS deliberately does not interpret JavaScript numbers or infer CSS units. The generated public types only admit numeric `0` in length-like positions where unitless zero is unambiguous, so `margin: 0` is valid while `margin: 8`, `opacity: 0.5`, and `zIndex: 10` are rejected.
:::

::: code-group

<<< @/.examples/getting-started/basic.example.pikain.ts [Input]

<<< @/.examples/getting-started/basic.example.pikaout.css [Output]

:::

### Pseudo-Classes and Pseudo-Elements

Use `$:hover`, `$:focus`, `$::before`, etc. to add pseudo selectors:

::: code-group

<<< @/.examples/getting-started/pseudo.example.pikain.ts [Input]

<<< @/.examples/getting-started/pseudo.example.pikaout.css [Output]

:::

### Responsive Styles

Use `@media` queries as keys for responsive breakpoints:

::: code-group

<<< @/.examples/getting-started/responsive.example.pikain.ts [Input]

<<< @/.examples/getting-started/responsive.example.pikaout.css [Output]

:::

### Custom Selectors

Use custom selector names defined in your engine config. This example requires the `@dark` selector to be registered first:

```ts
// pika.config.ts
import { defineEngineConfig } from '@pikacss/core'

export default defineEngineConfig({
  selectors: {
    definitions: [
      ['@dark', 'html.dark $'],
    ],
  },
})
```

::: code-group

<<< @/.examples/getting-started/custom-selector.example.pikain.ts [Input]

<<< @/.examples/getting-started/custom-selector.example.pikaout.css [Output]

:::

### Shortcut References

Reference named shortcuts as string arguments:

```ts
// Assuming a shortcut "flex-center" is defined in config
const className = pika('flex-center')
```

## Next

- [Engine Config](/getting-started/engine-config) — customize the engine behavior.
- [Customizations](/customizations/selectors) — define custom selectors.
