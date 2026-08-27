---
title: Comparison
description: How PikaCSS compares to UnoCSS, Tailwind CSS, Panda CSS, and vanilla-extract.
relatedPackages:
  - '@pikacss/core'
  - '@pikacss/unplugin-pikacss'
relatedSources:
  - 'packages/core/src/atomic-style.ts'
  - 'packages/core/src/property-effects.ts'
  - 'packages/integration/src/ctx.ts'
category: getting-started
order: 15
---

# Comparison

How PikaCSS relates to other build-time styling tools, and when it is (or is not) the right choice.

::: info Honest framing
PikaCSS is pre-1.0 and its API is not yet stable. The other tools below are more mature and have larger ecosystems. The comparison focuses on the authoring model and the engine design, not on which project is "better". Competitor descriptions summarize each project's own documented positioning; check their docs for current details.
:::

## At a Glance

| | PikaCSS | UnoCSS | Tailwind CSS | Panda CSS | vanilla-extract |
|---|---|---|---|---|---|
| **Authoring syntax** | CSS-in-JS objects inline in components: `pika({ color: 'red' })` | Utility class names in markup (plus attributify and other presets) | Utility class names in markup | CSS-in-JS functions (`css()`, recipes) in components, statically extracted | CSS-in-TS in separate `.css.ts` files |
| **Runtime cost** | None — every call is replaced with configured class-name data at build time (string by default, optional string array) | None — CSS generated at build time | None — CSS generated at build time | CSS generated at build time; a lightweight JS runtime composes class names | None for static styles; optional runtime helpers for dynamic values |
| **Dynamic values** | Not in arguments — use [variant maps or CSS variables](/getting-started/dynamic-styles) | Class names must be statically detectable | Class names must be statically detectable | Static extraction; runtime values via CSS variables | CSS variables via `assignInlineVars` |
| **SSR** | No special handling — output is ordinary [static CSS artifacts](/integrations/ssr-and-production) | Static CSS output | Static CSS output | Static CSS output | Static CSS output |
| **Type safety** | Generated types drive IDE autocomplete for properties, selectors, and shortcuts; arbitrary strings are still accepted | Class names are plain strings; IDE extension available | Class names are plain strings; IDE extension available | Generated types for tokens and recipes | Strongly typed style objects |
| **Maturity** | Pre-1.0, API not stable | Established, widely used | Very mature, extensive ecosystem | Established | Established |

## What Actually Differs

### CSS-in-JS authoring, atomic CSS output

Utility-class tools (UnoCSS, Tailwind CSS) make you learn and type their class vocabulary. PikaCSS keeps plain CSS property names in JavaScript objects — the same mental model as inline styles or styled-components — and still emits deduplicated atomic classes. See [How pika() Works](/getting-started/what-is-pikacss#how-pika-works).

### Shorthand/longhand cascade conflicts are resolved by the engine

Atomic CSS has a structural problem: when `padding` and `padding-top` classes land on the same element, the winner is decided by stylesheet order, not by your intent. Runtime class-merging utilities exist in other ecosystems to work around this.

PikaCSS resolves it at build time: the engine tracks overlapping property effects and guarantees that an overriding declaration is rendered after the declarations it overrides, minting a new class when reusing an old one would break that order (`packages/core/src/atomic-style.ts`, `packages/core/src/property-effects.ts`).

::: code-group

<<< @/.examples/getting-started/cascade.example.pikain.ts [Input]

<<< @/.examples/getting-started/cascade.example.pikaout.css [Output]

:::

### Truly zero runtime, including the function itself

`pika()` does not exist at runtime. The build plugin replaces every call with its configured class-name data (a string by default, or a string array when configured), so no PikaCSS styling library ships to the browser at all. Tools with a `css()`-style API also generate the CSS at build time, but the function itself typically still runs in the browser to compose class names; utility-class tools never had a runtime function to begin with.

### The trade-off: static-only arguments

Because calls are evaluated at build time, arguments must be self-contained literals — no variables, conditionals, or spreads of outer values. This is the same class of constraint as Tailwind's "don't construct class names dynamically" rule, expressed at the function-call level. [Dynamic Styles](/getting-started/dynamic-styles) covers the supported patterns.

## When Not to Use PikaCSS

- You need a stable 1.0 API and long-term migration guarantees today.
- You rely on a large ecosystem of prebuilt UI components tied to a specific class vocabulary.
- Your styles are dominated by truly runtime-computed values that CSS variables cannot express.

## Next

- [Setup](/getting-started/setup) — try it in a project.
- [What is PikaCSS](/getting-started/what-is-pikacss) — the full concept walkthrough.
- [Dynamic Styles](/getting-started/dynamic-styles) — patterns for runtime-driven styling.
