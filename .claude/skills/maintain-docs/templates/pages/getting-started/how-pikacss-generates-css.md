# How PikaCSS Generates CSS

<!-- Section: Getting Started | Category: getting-started -->

<!-- Brief intro: what the engine does between a pika() call and the generated stylesheet -->

## The Pipeline

<!-- Numbered walkthrough: scan, build-time evaluation, extraction into atomic styles with short class IDs, call replacement, rendering into the generated CSS file -->

## Deduplication

<!-- Atomic styles are keyed by [selector, property, value]; the same declaration anywhere in the project resolves to the same class -->

::: code-group

<<< @/.examples/getting-started/<dedup>.example.pikain.ts [Input]

<<< @/.examples/getting-started/<dedup>.example.pikaout.css [Output]

:::

## Last Wins Per Property

<!-- Within one call (including expanded shortcuts), a later definition of the same [selector, property] pair replaces the earlier one -->

::: code-group

<<< @/.examples/getting-started/<last-wins>.example.pikain.ts [Input]

<<< @/.examples/getting-started/<last-wins>.example.pikaout.css [Output]

:::

## `null` Removes a Property

<!-- null/undefined values remove earlier definitions of that property in the same call — useful for subtracting from shortcuts or shared bases -->

::: code-group

<<< @/.examples/getting-started/<null-removal>.example.pikain.ts [Input]

<<< @/.examples/getting-started/<null-removal>.example.pikaout.css [Output]

:::

## Value Fallbacks

<!-- [value, fallbacks] tuples render fallbacks first and the primary value last inside a single rule -->

::: code-group

<<< @/.examples/getting-started/<value-fallbacks>.example.pikain.ts [Input]

<<< @/.examples/getting-started/<value-fallbacks>.example.pikaout.css [Output]

:::

## Output Ordering

<!-- Explain rendering weight (default-selector rules weigh 0, nested selector segments add weight), stable registration order within a weight, and order-protected shorthand/longhand conflicts (atomic-style.ts, property-effects.ts) -->

<!-- Practical consequence: independent classes on the same element are decided by stylesheet position, not class attribute order — prefer single-call composition -->

## Layer Grouping

<!-- Explain @layer wrapping: default preflights (weight 1) and utilities (weight 10) layers, the emitted order declaration, __layer routing, and the warning + unlayered rendering for unregistered layer names; link to Layers -->

## Next
<!-- Link to Layers, Dynamic Styles, and Engine Config -->
