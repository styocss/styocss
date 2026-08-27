# Customizations

> Read this when the user asks about variables and themes, keyframes, preflights, selectors, shortcuts, shortcut array composition, layers, `!important`, CSS property syntax, value fallbacks, or typed reusable config fragments.

## Variables and Theming

Register variables under `variables.definitions`:

```ts
export default defineConfig({
  engine: {
  variables: {
    definitions: {
      '--color-primary': { value: '#3b82f6' },
      '--color-text': { value: '#1a1a1a' },
      '--spacing-md': { value: '1rem' },
    },
  },
  },
})
```

Variable leaves are object-only. Add `suggest`, `description`, or `pruneUnused` when a variable needs per-variable metadata:

```ts
variables: {
  definitions: {
    '--color-primary': {
      value: '#3b82f6',
      suggest: {
        asValueOf: ['color', 'backgroundColor'],
        asProperty: true,
      },
      pruneUnused: false,
    },
  },
}
```

- `suggest.asValueOf: '*'` suggests the variable for every CSS property.
- `suggest.asValueOf: false` suppresses value suggestions.
- `suggest.asProperty` controls whether the variable name itself is emitted as a custom-property authoring symbol.

### Scoped themes

Non-variable keys are emitted as selector scopes:

```ts
variables: {
  definitions: {
    '--color-bg': { value: '#fff' },
    '--color-text': { value: '#1a1a1a' },

    'html.dark': {
      '--color-bg': { value: '#1a1a1a' },
      '--color-text': { value: '#f5f5f5' },
    },

    '[data-theme="high-contrast"]': {
      '--color-text': { value: '#000' },
    },

    '@media (prefers-color-scheme: dark)': {
      '--system-bg': { value: '#1a1a1a' },
    },
  },
}
```

The scope must match the application's actual theme switch. Do not combine a class-based variable scope with a data-attribute selector alias unless the application applies both.

### Pruning

Unused variables are pruned by default. Keep variables through either:

```ts
variables: {
  pruneUnused: true,
  safeList: ['--color-accent'],
  definitions: {
    '--color-accent': { value: '#f00' },
    '--always-keep': {
      value: '1rem',
      pruneUnused: false,
    },
  },
}
```

Variable dependencies are expanded transitively. If an emitted variable references another variable, the dependency is emitted too.

## Keyframes

Keyframe definitions use the canonical object grammar:

```ts
export default defineConfig({
  engine: {
  keyframes: {
    definitions: [
      {
        name: 'spin',
        frames: {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
      },
      {
        name: 'fade-in',
        frames: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    ],
  },
  },
})
```

Reference names through `animation` or `animationName`:

```ts
pika({ animation: 'spin 1s linear infinite' })
```

Unused keyframes are pruned by default. Use the definition's pruning controls when a keyframe must always remain.

## Preflights

Preflights accept multiple public shapes.

### Raw CSS

```ts
preflights: [
  '*, *::before, *::after { box-sizing: border-box; }',
]
```

### Definition object

```ts
preflights: [
  {
    body: {
      margin: '0',
      fontFamily: 'system-ui, sans-serif',
    },
    '*, *::before, *::after': {
      boxSizing: 'border-box',
    },
  },
]
```

### Function

```ts
preflights: [
  (engine, isFormatted, context) => `
    :root { --class-prefix: ${engine.config.prefix}; }
  `,
]
```

When one preflight invokes another during rendering, forward the render-pass context to `engine.invokePreflight(fn, isFormatted, context)` so each function executes once per pass.

### Wrapped with metadata

```ts
preflights: [
  {
    id: 'app-base',
    layer: 'base',
    preflight: 'html { color-scheme: light dark; }',
  },
]
```

Stable IDs are useful when plugins need to recognize or exclude their own preflight.

## Selectors

There are three distinct selector forms. Do not mix their syntax.

### Built-in pseudo selectors

Direct CSS pseudo selectors use `$` before the colon:

```ts
pika({
  '$:hover': { opacity: '0.8' },
  '$:focus-visible': { outline: '2px solid currentColor' },
  '$::before': { content: '""' },
})
```

`$` represents the generated atomic class selector. Bare `:hover` is not the built-in direct pseudo syntax.

### Direct at-rules

CSS at-rules can be used directly:

```ts
pika({
  '@media (min-width: 768px)': {
    fontSize: '1.125rem',
  },
  '@supports (display: grid)': {
    display: 'grid',
  },
})
```

### Named selector aliases

Register reusable aliases under `selectors.definitions`:

```ts
export default defineConfig({
  engine: {
  selectors: {
    definitions: [
      { name: '@dark', value: 'html.dark $' },
      { name: '@motion-safe', value: '@media (prefers-reduced-motion: no-preference)' },
      { name: '@group-hover', value: '.group:hover $' },
    ],
  },
  },
})
```

```ts
pika({
  '@dark': { color: 'white' },
  '@motion-safe': { transition: 'opacity 150ms' },
})
```

Aliases may also be dynamic rules using a `RegExp`, resolver, and optional autocomplete patterns. Read the package API before inventing a dynamic rule shape.

## Shortcuts

Shortcut definitions use the canonical object grammar:

```ts
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
      name: 'button',
      value: {
        'padding': '0.5rem 1rem',
        'borderRadius': '0.375rem',
        '$:hover': { opacity: '0.8' },
      },
    },
    {
      name: 'button-primary',
      value: ['button', { backgroundColor: 'navy', color: 'white' }],
    },
    {
      pattern: /^size-(.+)$/,
      inputType: '`size-${string}`',
      resolve: ([, size]) => ({ width: size, height: size }),
      autocomplete: ['size-1rem', 'size-2rem'],
    },
  ],
}
```

Use shortcut names as ordinary style items:

```ts
pika('flex-center', 'button-primary', { gap: '0.5rem' })
```

A static shortcut may compose other shortcuts with `value: StyleItem[]`. There is no shortcut-expansion pseudo-property inside a style-definition object.

Unresolved ordinary strings remain raw/existing class names, so a base call may mix PikaCSS shortcuts and external classes.

## Layer Control

Define custom layers and set one per style definition:

```ts
export default defineConfig({
  engine: {
  layers: {
    reset: 0,
    preflights: 1,
    components: 5,
    utilities: 10,
  },
  },
})
```

```ts
pika({
  __layer: 'components',
  display: 'flex',
})
```

The layer should exist in `config.layers`; numeric weights determine output order.

## Important Control

Per-definition:

```ts
pika({
  __important: true,
  color: 'red',
})
```

Global default:

```ts
important: {
  default: true,
}
```

`__important` is applied by the Core important subsystem after style-item/shortcut resolution; shortcut composition itself is represented by ordinary style items.

## CSS Property Syntax

Both camelCase and kebab-case are valid:

```ts
pika({
  fontSize: '16px',
  marginTop: '1rem',
  'line-height': '1.5',
  '--local-gap': '0.5rem',
})
```

### Value fallbacks

The fallback shape is `[primaryValue, fallbackValues[]]`:

```ts
pika({
  color: ['oklch(0.7 0.15 220)', ['rgb(0 120 255)', 'blue']],
})
```

PikaCSS emits fallback declarations in the supplied array order, then the primary declaration:

```css
color: rgb(0 120 255);
color: blue;
color: oklch(0.7 0.15 220);
```

A flat array such as `['blue', 'red']` is not the property fallback tuple.

### Nullish values

`null` or `undefined` removes/unsets a property during optimization. This is useful when transformed style definitions intentionally cancel an earlier value.

## Typed Config Fragments

Only `defineEngineConfig` and `defineEnginePlugin` remain as public define helpers. For reusable fragments, use object literals with `satisfies` or explicit types:

```ts
import type {
  SelectorsConfig,
  ShortcutsConfig,
  StyleDefinition,
  VariablesDefinition,
} from '@pikacss/core'

const cardStyle: StyleDefinition = {
  padding: '1rem',
  borderRadius: '0.5rem',
}

const themeVariables = {
  '--color-primary': { value: '#3b82f6' },
  '.dark': {
    '--color-primary': { value: '#60a5fa' },
  },
} satisfies VariablesDefinition

const selectors = {
  definitions: [{ name: '@dark', value: 'html.dark $' }],
} satisfies SelectorsConfig

const shortcuts = {
  definitions: [{ name: 'card', value: cardStyle }],
} satisfies ShortcutsConfig
```

Apply the same approach to preflights, keyframes, autocomplete, and official-plugin config. Do not suggest removed legacy wrapper helpers.
