---
title: Dynamic Styles
description: Patterns for runtime-driven styling under PikaCSS's static-analyzability constraint.
relatedPackages:
  - '@pikacss/core'
  - '@pikacss/integration'
relatedSources:
  - 'packages/integration/src/ctx.ts'
  - 'packages/core/src/plugins/shortcuts.ts'
  - 'packages/eslint-config/src/rules/static-usage.ts'
category: getting-started
order: 35
---

# Dynamic Styles

`pika()` arguments must be static, but your UI is not. This page shows the patterns that cover runtime-driven styling.

## Why the Constraint Exists

At build time, the plugin extracts each `pika()` call from your source and evaluates its arguments as a self-contained expression — without running the rest of your module (`packages/integration/src/ctx.ts`). Anything that references a variable, calls a function, or branches on runtime state cannot be evaluated that way:

```ts
// ❌ These fail at build time — the call cannot see `color` or `isDark`
pika({ color })
pika({ color: isDark ? 'white' : 'black' })
```

The [ESLint rule `static-usage`](/getting-started/eslint-config) catches these before the build does. The key insight for every pattern below: **the set of styles must be static, but which style you apply at runtime is entirely up to you** — `pika()` just returns a string.

## Pattern 1: Variant Maps

Write one `pika()` call per variant and select between them at runtime. Every call is compiled at build time; the selection is plain object access.

::: code-group

<<< @/.examples/getting-started/variant-map.example.pikain.ts [Input]

<<< @/.examples/getting-started/variant-map.example.pikaout.css [Output]

:::

Note in the output that shared declarations (`color: white`) are deduplicated into one atomic class across variants.

Boolean state works the same way:

```ts
const tabClass = pika({ padding: '0.5rem 1rem' })
const activeTabClass = pika({ fontWeight: '700', color: '#3b82f6' })

// Runtime composition of build-time strings
const className = isActive ? `${tabClass} ${activeTabClass}` : tabClass
```

::: warning
When two variants set overlapping properties on the same element, which one wins is decided by the stylesheet, not by class order in the markup. Keep variant maps mutually exclusive per property, or split base and variant styles as above. See [How PikaCSS Generates CSS](/getting-started/how-pikacss-generates-css#output-ordering).
:::

## Pattern 2: CSS Variables for Truly Runtime Values

When the value itself only exists at runtime (a slider position, a computed color, user content), reference a CSS custom property in the style definition and set the property with an inline `style` attribute:

::: code-group

<<< @/.examples/getting-started/runtime-value.example.pikain.ts [Input]

<<< @/.examples/getting-started/runtime-value.example.pikaout.css [Output]

:::

Then feed the variable at runtime — the atomic class never changes:

::: code-group

```vue [Vue]
<div :class="progressBarClass" :style="{ '--progress': `${percent}%` }" />
```

```tsx [React]
<div className={progressBarClass} style={{ '--progress': `${percent}%` }} />
```

:::

## Pattern 3: Shortcuts as Recipes

For reusable multi-property styles with named variants, define [shortcuts](/customizations/shortcuts) in your engine config. Shortcuts compose (a variant can include the base shortcut), and usage stays a static string:

```ts
// pika.config.ts
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  engine: {
    shortcuts: {
      definitions: [
        {
          name: 'btn',
          value: {
            display: 'inline-flex',
            alignItems: 'center',
            padding: '0.5rem 1rem',
            borderRadius: '0.5rem',
            border: 'none',
            cursor: 'pointer',
          },
        },
        { name: 'btn-primary', value: ['btn', { backgroundColor: '#3b82f6', color: 'white' }] },
        { name: 'btn-danger', value: ['btn', { backgroundColor: '#ef4444', color: 'white' }] },
      ],
    },
  },
})
```

::: code-group

<<< @/.examples/getting-started/recipe-shortcuts.example.pikain.ts [Input]

<<< @/.examples/getting-started/recipe-shortcuts.example.pikaout.css [Output]

:::

Combine with Pattern 1 to select a shortcut at runtime:

```ts
const buttonVariants = {
	primary: pika('btn-primary'),
	danger: pika('btn-danger'),
}
```

Dynamic shortcut *rules* (regex-based, like the icon shortcuts from [@pikacss/plugin-icons](/official-plugins/icons)) still require the matched string itself to appear statically in a `pika()` call.

## Choosing a Pattern

| Situation | Pattern |
|---|---|
| A few known variants (size, intent, active state) | Variant map |
| Value computed at runtime (position, percentage, user color) | CSS variable + inline style |
| Reusable recipe shared across components | Shortcuts |

## Next

- [How PikaCSS Generates CSS](/getting-started/how-pikacss-generates-css) — what the engine does with your calls.
- [Shortcuts](/customizations/shortcuts) — full shortcut configuration reference.
- [ESLint Config](/getting-started/eslint-config) — catch dynamic arguments early.
