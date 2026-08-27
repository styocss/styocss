---
title: Available Hooks
description: Complete reference of PikaCSS engine plugin lifecycle hooks.
relatedPackages:
  - '@pikacss/core'
relatedSources:
  - 'packages/core/src/plugin.ts'
  - 'packages/core/src/diagnostics.ts'
  - 'packages/core/src/engine.ts'
category: plugin-development
order: 20
---

# Available Hooks

PikaCSS plugins can implement hooks that run at specific points in the engine lifecycle.

Every hook additionally receives a context object as its last parameter (omitted from the signatures below for brevity): `{ onDiagnostic, state, host }`, where `state` is the plugin's engine-local state declared via `createState` — see [Per-engine state](/plugin-development/create-a-plugin#per-engine-state) — and `host` carries host semantic metadata such as `host.projectRoot`, the engine's effective project root supplied by the bundler integration. Plugins that load project-relative resources should resolve them against `host.projectRoot` instead of `process.cwd()`.

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

Called after the raw config is resolved into a `ResolvedEngineConfig`. Plugins can adjust resolved values such as prefix or layer configuration before the Engine is constructed.

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
configureEngine?: (engine: EngineConfigurator<State>) => void | Promise<void>
```

### When

Called once while the Engine is being initialized, after resolved configuration exists. The configurator is owner-bound to the current plugin and exposes:

- `engine.runtime` — the underlying `Engine` for stable runtime APIs such as `addPreflight()` and initialization-time config dependencies.
- `engine.pika` — initialization-only ownership capability for first-level static Pika extensions.
- `engine.typegen` — initialization-only Typegen contribution capability.
- `engine.state`, `engine.host`, `engine.onDiagnostic` — the same engine-local plugin context data used by other hooks.

Config-backed semantic domains do **not** expose runtime `.add()` producer services. Add selectors, shortcuts, variables, or keyframes in `configureRawConfig`, then use `configureEngine` only for capabilities that require an initialized Engine.

### Example

```ts
defineEnginePlugin({
  name: 'add-base-styles',
  configureRawConfig(config) {
    config.layers ??= {}
    config.layers.base ??= 0
    config.selectors = {
      definitions: [
        ...(config.selectors?.definitions ?? []),
        { name: '@dark', value: 'html.dark $' },
      ],
    }
  },
  configureEngine(engine) {
    engine.runtime.addPreflight({
      layer: 'base',
      preflight: '*, *::before, *::after { box-sizing: border-box; }',
    })
  },
})
```

The default layers are `preflights` (weight `1`) and `utilities` (weight `10`); registering `base` at weight `0` places it before both.

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

## Next

- [Type Augmentation](/plugin-development/type-augmentation) — extend PikaCSS types.
- [Create a Plugin](/plugin-development/create-a-plugin) — plugin structure and the defineEnginePlugin helper.
- [Define Helpers](/plugin-development/define-helpers) — `defineEngineConfig` and `defineEnginePlugin`.
