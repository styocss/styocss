# Dynamic Styles

<!-- Section: Getting Started | Category: getting-started -->

<!-- Brief intro: pika() arguments must be static, but runtime-driven styling is still covered by the patterns on this page -->

## Why the Constraint Exists

<!-- Explain build-time extraction: each call is evaluated as a self-contained expression (packages/integration/src/ctx.ts); show invalid dynamic-argument examples and mention the no-dynamic-args ESLint rule -->

<!-- Key insight: the set of styles must be static, but which style is applied at runtime is up to the user — pika() just returns a string -->

## Pattern 1: Variant Maps

<!-- One pika() call per variant, runtime selection between the returned strings; note cross-variant deduplication in the output -->

::: code-group

<<< @/.examples/getting-started/<variant-map>.example.pikain.ts [Input]

<<< @/.examples/getting-started/<variant-map>.example.pikaout.css [Output]

:::

::: warning
<!-- Overlapping properties across stacked variant classes are decided by stylesheet order, not markup class order; link to How PikaCSS Generates CSS output ordering -->
:::

## Pattern 2: CSS Variables for Truly Runtime Values

<!-- Reference a CSS custom property in the style definition and feed the value via an inline style attribute at runtime -->

::: code-group

<<< @/.examples/getting-started/<runtime-value>.example.pikain.ts [Input]

<<< @/.examples/getting-started/<runtime-value>.example.pikaout.css [Output]

:::

## Pattern 3: Shortcuts as Recipes

<!-- Define shortcuts in the engine config as reusable multi-property recipes; show shortcut composition and static usage -->

::: code-group

<<< @/.examples/getting-started/<recipe-shortcuts>.example.pikain.ts [Input]

<<< @/.examples/getting-started/<recipe-shortcuts>.example.pikaout.css [Output]

:::

## Choosing a Pattern

<!-- Decision table mapping situations (known variants, runtime-computed values, reusable recipes) to patterns -->

## Next
<!-- Link to How PikaCSS Generates CSS, Shortcuts, and ESLint Config -->
