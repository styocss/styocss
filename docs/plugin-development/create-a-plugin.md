---
title: Create a Plugin
description: Learn how to create a PikaCSS engine plugin with defineEnginePlugin.
relatedPackages:
  - '@pikacss/core'
relatedSources:
  - 'packages/core/src/plugin.ts'
  - 'packages/core/src/engine.ts'
  - 'packages/plugin-reset/src/index.test.ts'
category: plugin-development
order: 10
---

# Create a Plugin

Build custom PikaCSS engine plugins to extend the engine with new capabilities.

## Structure

A PikaCSS plugin is a function that returns an `EnginePlugin` object. The recommended pattern:

<<< @/.examples/plugin-development/create-plugin.example.ts

## defineEnginePlugin

The `defineEnginePlugin` helper provides type inference for the plugin object. It accepts an object with:

- `name` — a unique string identifying the plugin.
- `order` — optional execution order: `'pre'`, `'post'`, or omit for default.
- Hook methods — functions called at specific points in the engine lifecycle.

The example above uses `defineEnginePlugin()` directly so the `config` and `engine` hook parameters stay inferred without additional helper types.

## order

Plugin execution order determines when a plugin's hooks run relative to other plugins:

| Value | Behavior |
|-------|----------|
| `'pre'` | Runs before default-order plugins |
| *(omitted)* | Default order — runs in registration order |
| `'post'` | Runs after default-order plugins |

Within the same order group, plugins run in the order they appear in the `plugins` array. The core plugins (`variables`, `keyframes`, `selectors`, `shortcuts`, `important`) are prepended automatically and use the default order, so default-order user plugins always run after them.

## Lifecycle & Gotchas {#lifecycle-and-gotchas}

Operational behavior that is easy to miss when writing a first plugin.

### Hook errors are caught, not thrown

If a hook throws, the engine logs the error and continues the pipeline with the previous payload (`packages/core/src/plugin.ts`). `createEngine()` does not fail, and later plugins still run. Two consequences:

- A broken plugin degrades silently — watch the log output (`Plugin "<name>" failed to execute hook "<hook>"`) while developing.
- A transform hook that throws leaves the payload as it was before your plugin ran, so partial mutations you made before throwing may still be visible if you mutated the payload in place.

### `order: 'pre'` runs before core services attach

`engine.selectors`, `engine.shortcuts`, `engine.keyframes`, and `engine.variables` are attached by the core plugins during *their* `configureEngine` hooks. A plugin with `order: 'pre'` runs `configureEngine` before that happens, so touching those services throws — and per the previous point, the error is swallowed into a log line. Engine methods that exist at construction (`addPreflight`, `appendAutocomplete`, `appendCssImport`, `addConfigDependency`) are safe in any order group. `@pikacss/plugin-design-tokens` is a real `order: 'pre'` plugin that follows this rule: it only mutates the raw config and calls `addConfigDependency`.

### Register loaded files with `addConfigDependency`

If your plugin reads external files (token files, icon sets, JSON themes), register every loaded path:

```ts
defineEnginePlugin({
  name: 'my-plugin',
  configureEngine: (engine) => {
    engine.addConfigDependency('/absolute/path/to/tokens.json')
  },
})
```

The build integrations watch these paths and re-create the engine when one changes — specifically when its *content* changes, so a dependency whose bytes stay the same is treated as unchanged even if its meaning did not (see [SSR & Production](/integrations/ssr-and-production#what-triggers-a-reload-in-dev)). Without this, users must restart the dev server to pick up edits to your plugin's source files. This is how `@pikacss/plugin-design-tokens` reloads token files.

## Testing a Plugin

Plugin hooks are plain functions, so most plugin behavior tests need no real engine — mirror the official `@pikacss/plugin-reset` test (`packages/plugin-reset/src/index.test.ts`): call the hooks directly with a minimal mock and assert the effects.

```ts
import { describe, expect, it, vi } from 'vitest'
import { myPlugin } from './index'

describe('myPlugin', () => {
  it('registers its layer and preflight', async () => {
    const plugin = myPlugin()
    const engine = { addPreflight: vi.fn() }
    const config: Record<string, any> = {}

    plugin.configureRawConfig?.(config as any)
    await plugin.configureEngine?.(engine as any)

    expect(config.layers).toEqual({ 'my-layer': 5 })
    expect(engine.addPreflight).toHaveBeenCalled()
  })
})
```

For end-to-end assertions on generated CSS, create a real engine instead: `const engine = await createEngine({ plugins: [myPlugin()] })`, then `await engine.use({ ... })` and snapshot `await engine.renderAtomicStyles(true)`.

## Next

- [Available Hooks](/plugin-development/available-hooks) — all lifecycle hooks you can implement.
- [Type Augmentation](/plugin-development/type-augmentation) — extend PikaCSS types for your plugin.
- [Define Helpers](/plugin-development/define-helpers) — `defineEngineConfig` and `defineEnginePlugin`.
