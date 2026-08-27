---
title: Variables
description: Define object-only local and external CSS custom properties with domain-owned suggestions.
relatedPackages:
  - '@pikacss/core'
relatedSources:
  - 'packages/core/src/plugins/variables.ts'
category: customizations
order: 40
---

# Variables

The Variables subsystem owns CSS custom-property semantics, pruning, and Typegen suggestions. Variable leaves are object-only.

## Local variables

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  engine: {
  variables: {
    definitions: {
      '--color-primary': { value: '#3b82f6' },
      '--spacing-md': { value: '1rem' },
      '--brand-color': {
        value: '#2563eb',
        description: 'Primary brand color',
        suggest: {
          asProperty: true,
          asValueOf: ['color', 'backgroundColor'],
        },
      },
    },
  },
  },
})
```

`suggest.asProperty` controls whether the variable itself appears as an explicit custom-property member. `suggest.asValueOf` controls which CSS property values suggest `var(--name)`; `'*'` is the explicit wildcard.

## External variables

Use `external: true` for variables supplied by another stylesheet/runtime. They participate in authoring suggestions but PikaCSS does not emit their value:

```ts
variables: {
  definitions: {
    '--host-theme-color': {
      external: true,
      suggest: { asValueOf: ['color', 'backgroundColor'] },
    },
  },
}
```

## Selector scopes

Non-variable keys form nested selector scopes:

```ts
variables: {
  definitions: {
    ':root': {
      '--color-bg': { value: '#ffffff' },
    },
    '.dark': {
      '--color-bg': { value: '#1a1a1a' },
    },
  },
}
```

## Pruning

Local variables are pruned by default unless current emitted CSS/preflights reference them transitively. Use a leaf-level `pruneUnused: false`, `safeList`, or config-level `pruneUnused: false` when external CSS needs a PikaCSS-owned variable regardless of current Pika usage.

```ts
variables: {
  definitions: {
    '--always': { value: '1rem', pruneUnused: false },
  },
  safeList: ['--always'],
}
```

Use variables normally:

```ts
pika({ color: 'var(--color-primary)' })
```

## Examples

<<< @/.examples/customizations/variables.example.ts

## Next

- [Keyframes](/customizations/keyframes)
- [Autocomplete](/customizations/autocomplete)
