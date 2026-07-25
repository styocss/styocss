# Design Tokens

<!-- Section: Official Plugins | Category: official-plugins -->

<!-- Explain converting design tokens (inline objects, W3C Design Tokens JSON files, or markdown design documents) into CSS variables through the core variables system. Mention unused-pruning, autocomplete, and config dependency registration for reload. -->

## Token Sources

<!-- Explain the sources option: inline token groups or file paths resolved against root. -->

### JSON Token Files

<!-- Explain W3C Design Tokens JSON parsing: $value nodes, nested groups, skipped $-prefixed metadata keys. -->

### Markdown Design Documents

<!-- Explain design.md documents: only ```tokens fenced blocks are read; theme=<name> and selector=<css> fence attributes. -->

## Themes

<!-- Explain base :root emission vs theme selectors, the .<themeName> default selector, and selector precedence. -->

## Token Names and Aliases

<!-- Explain kebab-cased variable naming, the prefix option, and {path.to.token} alias resolution to var(--path-to-token). -->

## Composite Values

<!-- Explain shadow/border/transition serialization, array joining, and unknown composite expansion into sub-variables. -->

## Config

| Property | Description |
|---|---|
| sources | <!-- Base token sources emitted under :root --> |
| themes | <!-- Theme overrides keyed by theme name (selector + sources) --> |
| prefix | <!-- Variable name prefix without leading -- --> |
| root | <!-- Base directory for resolving relative source paths --> |
| pruneUnused | <!-- Pruning override for generated variables --> |

> See [API Reference — Plugin Design Tokens](/api/plugin-design-tokens) for full type signatures and defaults.

## Next
<!-- Link to other Official Plugins or Customizations -->
