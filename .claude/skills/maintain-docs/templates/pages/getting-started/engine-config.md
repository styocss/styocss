# Engine Config

<!-- Section: Getting Started | Category: getting-started -->

## Config

### Core

| Property | Description |
|---|---|
| prefix | <!-- Class name prefix --> |
| defaultSelector | <!-- Default selector applied to utilities --> |
| plugins | <!-- Plugin loading order pre/post concept, link to Plugin Development --> |
| layers | <!-- CSS @layer configuration. See [Layers](/customizations/layers) --> |
| defaultPreflightsLayer | <!-- Layer name for preflights --> |
| defaultUtilitiesLayer | <!-- Layer name for utilities --> |
| preflights | <!-- Base styles injected before utilities. See [Preflights](/customizations/preflights) --> |
| cssImports | <!-- Additional CSS imports --> |
| autocomplete | <!-- IDE autocomplete configuration. See [Autocomplete](/customizations/autocomplete) --> |

### Customizations

| Property | Description |
|---|---|
| important | <!-- Force !important on all utilities. See [Important](/customizations/important) --> |
| selectors | <!-- Custom selector mappings. See [Selectors](/customizations/selectors) --> |
| shortcuts | <!-- Reusable style aliases. See [Shortcuts](/customizations/shortcuts) --> |
| variables | <!-- CSS custom properties. See [Variables](/customizations/variables) --> |
| keyframes | <!-- CSS keyframe animations. See [Keyframes](/customizations/keyframes) --> |

### Plugin Config

::: tip
Plugin config fields appear only after installing the corresponding plugin.
:::

| Property | Description |
|---|---|
| reset | <!-- See [Reset plugin](/official-plugins/reset) --> |
| typography | <!-- See [Typography plugin](/official-plugins/typography) --> |
| icons | <!-- See [Icons plugin](/official-plugins/icons) --> |
| fonts | <!-- See [Fonts plugin](/official-plugins/fonts) --> |

> See [API Reference — Core](/api/core) for full type signatures and defaults.

## Examples

<!-- {Template: demonstrate a complete engine config with multiple options} -->

::: code-group

```ts [pika.config.ts]
// <!-- Show a complete engine config example -->
```

:::

## Next
<!-- Link to ESLint Config, Customizations, or Official Plugins -->
