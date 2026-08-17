---
title: Available Hooks
description: Complete reference of PikaCSS engine plugin lifecycle hooks.
relatedPackages:
  - '@pikacss/core'
relatedSources:
  - 'packages/core/src/plugin.ts'
  - 'packages/core/src/engine.ts'
category: plugin-development
order: 20
---

# Available Hooks

PikaCSS plugins can implement hooks that run at specific points in the engine lifecycle.

Every hook additionally receives a context object as its last parameter (omitted from the signatures below for brevity): `{ onDiagnostic, state }`, where `state` is the plugin's engine-local state declared via `createState` — see [Per-engine state](/plugin-development/create-a-plugin#per-engine-state).

## configureRawConfig

### Signature

```ts
configureRawConfig?: (config: EngineConfig) => void | EngineConfig | Promise<void | EngineConfig>
```

### When

Called during `createEngine()` before the raw config is resolved into its final form. Plugins can mutate the config object in-place or return a new one.

### Example

```ts
defineEnginePlugin({
  name: 'add-layer',
  configureRawConfig: (config) => {
    config.layers ??= {}
    config.layers['my-layer'] = 5
  },
})
```

## rawConfigConfigured

### Signature

```ts
rawConfigConfigured?: (config: EngineConfig) => void
```

### When

Called after `configureRawConfig` has run for all plugins. The raw config is finalized — this is a notification hook for reading the final raw config, not for mutation.

### Example

```ts
defineEnginePlugin({
  name: 'log-config',
  rawConfigConfigured: (config) => {
    console.log('Final raw config:', config)
  },
})
```

## configureResolvedConfig

### Signature

```ts
configureResolvedConfig?: (config: ResolvedEngineConfig) => void | ResolvedEngineConfig | Promise<void | ResolvedEngineConfig>
```

### When

Called after the raw config is resolved into a `ResolvedEngineConfig`. Plugins can adjust resolved values like prefix, layers, or autocomplete state.

### Example

```ts
defineEnginePlugin({
  name: 'override-prefix',
  configureResolvedConfig: (config) => {
    config.prefix = 'custom-'
  },
})
```

## configureEngine

### Signature

```ts
configureEngine?: (engine: Engine) => void | Engine | Promise<void | Engine>
```

### When

Called after the engine instance is constructed. Plugins can add preflights, register autocomplete entries, or extend the engine with custom behavior.

::: warning Core services and `order: 'pre'`
The `engine.selectors`, `engine.shortcuts`, `engine.keyframes`, and `engine.variables` services are attached by the core plugins' own `configureEngine` hooks. Core plugins run in the default order group, so a plugin with `order: 'pre'` reaches `configureEngine` **before** those services exist — accessing them there throws and `createEngine()` rejects; bundler integrations surface this as a config-load diagnostic and fall back to a plugin-less engine, so the root cause can be easy to miss. Use the default order when you need these services, or restrict a `'pre'` plugin to config hooks and engine methods that exist at construction (such as `addPreflight` and `addConfigDependency`). See [Lifecycle & Gotchas](/plugin-development/create-a-plugin#lifecycle-and-gotchas).
:::

### Example

```ts
defineEnginePlugin({
  name: 'add-preflight',
  configureRawConfig: (config) => {
    // Register the layer this plugin renders into. A preflight assigned to an
    // undeclared layer is rendered as a trailing `@layer` block that is missing
    // from the layer order declaration, giving it the HIGHEST cascade priority —
    // the opposite of what a base layer should do.
    config.layers ??= {}
    config.layers.base ??= 0
  },
  configureEngine: async (engine) => {
    engine.addPreflight({
      layer: 'base',
      preflight: '*, *::before, *::after { box-sizing: border-box; }',
    })
    engine.selectors.add(['@dark', 'html.dark $'])
    engine.shortcuts.add(['flex-center', { display: 'flex', alignItems: 'center', justifyContent: 'center' }])
    engine.keyframes.add(['fade-in', { from: { opacity: '0' }, to: { opacity: '1' } }])
    engine.variables.add({ '--color-primary': '#3b82f6' })
  },
})
```

The default layers are `preflights` (weight `1`) and `utilities` (weight `10`); registering `base` at weight `0` places it before both in the `@layer` order declaration.

## transformSelectors

### Signature

```ts
transformSelectors?: (selectors: string[]) => string[] | void | Promise<string[] | void>
```

### When

Called when selector strings are being resolved during style extraction. Plugins can rewrite, expand, or filter selector values. Return `void` to leave the current selector list unchanged.

### Example

```ts
defineEnginePlugin({
  name: 'dark-mode',
  transformSelectors: (selectors) => {
    return selectors.map(s =>
      s === '@dark' ? 'html.dark $' : s
    )
  },
})
```

## transformStyleItems

### Signature

```ts
transformStyleItems?: (items: StyleItem[]) => StyleItem[] | void | Promise<StyleItem[] | void>
```

### When

Called when style items are being processed in `engine.use()`. The signature above uses the base exported `StyleItem` alias for readability, but the runtime payload is the resolved, augmentation-aware style item list after any `PikaAugment.StyleItem` extensions are applied. Plugins can inject, remove, or rewrite items before they are extracted into atomic styles. Return `void` to keep the current items unchanged.

### Example

```ts
defineEnginePlugin({
  name: 'expand-shortcut',
  transformStyleItems: (items) => {
    return items.flatMap(item =>
      item === 'my-shortcut'
        ? [{ display: 'flex' }, { alignItems: 'center' }]
        : [item]
    )
  },
})
```

## transformStyleDefinitions

### Signature

```ts
transformStyleDefinitions?: (definitions: StyleDefinition[]) => StyleDefinition[] | void | Promise<StyleDefinition[] | void>
```

### When

Called after style items are converted to style definitions. The signature above uses the base exported `StyleDefinition` alias for readability, but the runtime payload is the resolved, augmentation-aware definition list after any `PikaAugment.StyleDefinition` extensions are applied. Plugins can transform definitions before they are extracted into atomic CSS contents. Return `void` to keep the current definitions unchanged.

### Example

```ts
defineEnginePlugin({
  name: 'auto-prefix',
  transformStyleDefinitions: (definitions) => {
    return definitions
  },
})
```

## transformStyleContents

### Signature

```ts
transformStyleContents?: (contents: StyleContent[]) => StyleContent[] | void | Promise<StyleContent[] | void>
```

### When

Called after extraction and normalization, but before any atomic style ID is allocated. Each `StyleContent` is one normalized atomic entry (`selector`, `property`, `value`). This is the last provisional seam: plugins can rewrite entries 1→1 or expand them 1→N — compatibility lowering, logical-property transforms, custom optimizations, or PikaCSS-level prefixing — without consuming IDs before the transformation succeeds. The engine re-deduplicates and recomputes order sensitivity after the hook runs. Throwing aborts preparation with zero committed engine state. Return `void` to keep the current contents unchanged.

### Example

```ts
defineEnginePlugin({
  name: 'user-select-lowering',
  transformStyleContents: (contents) => {
    return contents.flatMap(content =>
      content.property === 'user-select'
        ? [{ ...content, property: '-webkit-user-select' }, content]
        : [content]
    )
  },
})
```

## preflightUpdated

### Signature

```ts
preflightUpdated?: () => void
```

### When

Called whenever a preflight is added or CSS imports change. Use this hook to react to preflight changes.

### Example

```ts
defineEnginePlugin({
  name: 'preflight-watcher',
  preflightUpdated: () => {
    console.log('Preflights changed')
  },
})
```

## atomicStyleAdded

### Signature

```ts
atomicStyleAdded?: (atomicStyle: AtomicStyle) => void
```

### When

Called each time a new atomic style is registered in the engine store. Use this for tracking, analysis, or side effects.

::: warning Committed notification, not a mutation seam
When this hook fires, the style is already committed: its ID, cache keys, and store indices are established, so mutating the payload is unsupported. A thrown error is reported as a diagnostic but never rolls back the registration — and later plugins' observers are skipped for that one notification, so observers should not throw. Plugins that need to transform styles must use the provisional hooks (`transformStyleItems`, `transformStyleDefinitions`, `transformSelectors`, `transformStyleContents`) instead.
:::

### Example

```ts
defineEnginePlugin({
  name: 'style-tracker',
  atomicStyleAdded: (atomicStyle) => {
    console.log(`New style: ${atomicStyle.id}`)
  },
})
```

## autocompleteConfigUpdated

### Signature

```ts
autocompleteConfigUpdated?: () => void
```

### When

Called whenever the autocomplete configuration changes. Use this to react to new autocomplete entries.

### Example

```ts
defineEnginePlugin({
  name: 'autocomplete-watcher',
  autocompleteConfigUpdated: () => {
    console.log('Autocomplete updated')
  },
})
```

## Next

- [Type Augmentation](/plugin-development/type-augmentation) — extend PikaCSS types.
- [Create a Plugin](/plugin-development/create-a-plugin) — plugin structure and the defineEnginePlugin helper.
- [Define Helpers](/plugin-development/define-helpers) — `defineEngineConfig` and `defineEnginePlugin`.
