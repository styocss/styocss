---
title: Create a Plugin
description: Learn how to create a PikaCSS engine plugin with defineEnginePlugin.
relatedPackages:
  - '@pikacss/core'
relatedSources:
  - 'packages/core/src/plugin.ts'
  - 'packages/core/src/diagnostics.ts'
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

## Per-engine state {#per-engine-state}

A plugin object returned from `defineEnginePlugin()` is a reusable **definition**: the same object may be passed to any number of `createEngine()` calls, sequentially or concurrently. Mutable per-engine data therefore must never live in the plugin factory's closure — a second engine reusing the definition would overwrite it while the first engine still reads it.

Declare engine-local state with `createState` and access it through `context.state`, the last parameter every hook receives:

```ts
defineEnginePlugin({
  name: 'my-plugin',
  createState: () => ({ resolved: {} as MyPluginOptions }),
  configureRawConfig: (config, context) => {
    context.state.resolved = config.myPlugin ?? {}
  },
  configureEngine: (engine, context) => {
    // Long-lived callbacks must capture `context` (stable per engine),
    // never a mutable closure variable shared by every engine.
    engine.addPreflight(() => renderCss(context.state.resolved))
  },
})
```

The engine invokes `createState()` at most once per plugin definition **per engine**, before that plugin's first hook runs for that engine; every hook invocation of that plugin/engine pair then receives the same context object, from `configureRawConfig` through committed notifications. Stateless plugins simply omit `createState`. Factory arguments that are never mutated may stay in the closure as immutable definition configuration.

Two boundaries to respect:

- A deliberately shared process-global cache is allowed only when its key covers every input that can affect the result — prefer per-engine state first.
- Per-engine state is **engine-lifetime** state. Provisional transform hooks run before a module commits (see the [transactional lifecycle](/plugin-development/available-hooks#transformstylecontents)), so do not eagerly mutate permanent `context.state` from a provisional transform and expect a rollback if the module fails or is superseded.

## Lifecycle & Gotchas {#lifecycle-and-gotchas}

Operational behavior that is easy to miss when writing a first plugin.

### Hook errors are reported, then rethrown

If a hook throws, the engine reports a `plugin-hook-error` diagnostic and rethrows (`packages/core/src/plugin.ts`): `createEngine()` rejects when a configuration hook fails, and `engine.use()` rejects when a provisional transform hook fails — a failed lifecycle is never converted into a silently partial result. Two consequences:

- A failing plugin aborts the call that triggered it. Watch for the `Plugin "<name>" failed to execute hook "<hook>"` diagnostic while developing; bundler integrations surface configuration failures as config-load diagnostics.
- The one exception is the committed notification `atomicStyleAdded`: it fires after the style is already registered, so a throwing observer is reported as a diagnostic but never rolls back the commit — and observers of later plugins are skipped for that one notification. See [Available Hooks](/plugin-development/available-hooks#atomicstyleadded).

### `order: 'pre'` runs before core services attach

`engine.selectors`, `engine.shortcuts`, `engine.keyframes`, and `engine.variables` are attached by the core plugins during *their* `configureEngine` hooks. A plugin with `order: 'pre'` runs `configureEngine` before that happens, so touching those services throws — and per the previous point, `createEngine()` rejects, which bundler integrations report as a config-load failure. Engine methods that exist at construction (`addPreflight`, `appendAutocomplete`, `appendCssImport`, `addConfigDependency`) are safe in any order group. `@pikacss/plugin-design-tokens` is a real `order: 'pre'` plugin that follows this rule: it only mutates the raw config and calls `addConfigDependency`.

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

Plugin hooks are plain functions, so most plugin behavior tests need no real engine — mirror the official `@pikacss/plugin-reset` test (`packages/plugin-reset/src/index.test.ts`): call the hooks directly with a minimal mock and assert the effects. When invoking hooks by hand you must supply the context the engine would normally provide — build **one context per simulated engine** (`{ onDiagnostic, state: plugin.createState?.() }`) and pass that same object to every hook call of that engine, otherwise a stateful plugin's `context.state` access throws at runtime.

```ts
import { describe, expect, it, vi } from 'vitest'
import { myPlugin } from './index'

function createContext(plugin: any) {
  return { onDiagnostic: vi.fn(), state: plugin.createState?.() }
}

describe('myPlugin', () => {
  it('registers its layer and preflight', async () => {
    const plugin = myPlugin()
    const context = createContext(plugin)
    const engine = { addPreflight: vi.fn() }
    const config: Record<string, any> = {}

    plugin.configureRawConfig?.(config as any, context)
    await plugin.configureEngine?.(engine as any, context)

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
