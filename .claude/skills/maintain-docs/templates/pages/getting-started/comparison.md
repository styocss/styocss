# Comparison

<!-- Section: Getting Started | Category: getting-started -->

<!-- Brief intro: how PikaCSS relates to other build-time styling tools and when it is (or is not) the right choice -->

::: info Honest framing
<!-- State that PikaCSS is pre-1.0 and less mature than the compared tools; comparison covers authoring model and engine design, not which project is "better" -->
:::

## At a Glance

<!-- Comparison table (PikaCSS vs UnoCSS, Tailwind CSS, Panda CSS, vanilla-extract) covering authoring syntax, runtime cost, dynamic values, SSR, type safety, maturity -->

## What Actually Differs

### CSS-in-JS authoring, atomic CSS output
<!-- Contrast utility-class vocabularies with plain CSS property names in JS objects that still emit deduplicated atomic classes -->

### Shorthand/longhand cascade conflicts are resolved by the engine
<!-- Explain the atomic CSS ordering problem and the build-time resolution; back claims with atomic-style.ts and property-effects.ts -->

::: code-group

<<< @/.examples/getting-started/<cascade>.example.pikain.ts [Input]

<<< @/.examples/getting-started/<cascade>.example.pikaout.css [Output]

:::

### Truly zero runtime, including the function itself
<!-- Explain that pika() is replaced with a class-name string literal at build time — no styling library ships to the browser -->

### The trade-off: static-only arguments
<!-- Explain the static-analyzability constraint; link to Dynamic Styles for the supported patterns -->

## When Not to Use PikaCSS

<!-- Honest list of scenarios where another tool is a better fit -->

## Next
<!-- Link to Setup, What is PikaCSS, and Dynamic Styles -->
