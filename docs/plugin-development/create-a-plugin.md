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

Declare engine-local state with `createState`. Ordinary hooks access it through `context.state`; `configureEngine` receives an `EngineConfigurator` that exposes the same engine-local value as `configurator.state`:

```ts
defineEnginePlugin({
  name: 'my-plugin',
  createState: () => ({ resolved: {} as MyPluginOptions }),
  configureRawConfig: (config, context) => {
    context.state.resolved = config.myPlugin ?? {}
  },
  configureEngine: (configurator) => {
    // The configurator is stable for this plugin/engine initialization.
    // Long-lived callbacks should capture its engine-local `state`.
    configurator.runtime.addPreflight(() => renderCss(configurator.state.resolved))
  },
})
```

The engine invokes `createState()` at most once per plugin definition **per engine**, before that plugin's first hook runs for that engine. Every hook in that plugin/engine pair observes the same engine-local state, host context, and diagnostic sink; the `configureEngine` facade incorporates those values together with its owner-bound runtime/Pika/Typegen capabilities. Stateless plugins simply omit `createState`. Factory arguments that are never mutated may stay in the closure as immutable definition configuration.

Two boundaries to respect:

- A deliberately shared process-global cache is allowed only when its key covers every input that can affect the result — prefer per-engine state first.
- Per-engine state is **engine-lifetime** state. Provisional transform hooks run before a module commits (see the [transactional lifecycle](/plugin-development/available-hooks#transformstylecontents)), so do not eagerly mutate permanent `context.state` from a provisional transform and expect a rollback if the module fails or is superseded.

## Lifecycle & Gotchas {#lifecycle-and-gotchas}

Operational behavior that is easy to miss when writing a first plugin.

### Hook errors are reported, then rethrown

If a hook throws, the engine reports a `plugin-hook-error` diagnostic and rethrows (`packages/core/src/plugin.ts`): `createEngine()` rejects when a configuration hook fails, and `engine.use()` rejects when a provisional transform hook fails — a failed lifecycle is never converted into a silently partial result. Two consequences:

- A failing plugin aborts the call that triggered it. Watch for the `Plugin "<name>" failed to execute hook "<hook>"` diagnostic while developing; bundler integrations surface configuration failures as config-load diagnostics.
- The one exception is the committed notification `atomicStyleAdded`: it fires after the style is already registered, so a throwing observer is reported as a diagnostic but never rolls back the commit — and observers of later plugins are skipped for that one notification. See [Available Hooks](/plugin-development/available-hooks#atomicstyleadded).

### Lower semantic definitions before Engine construction

Selectors, shortcuts, variables, and keyframes are config-backed semantic domains. They intentionally expose no public runtime `.add()` ingress. A plugin that contributes those semantics should append object definitions in `configureRawConfig`; Core then owns normalization, runtime resolution, Typegen, and finalization consistently.

`configureEngine` is for initialized Engine APIs and the owner-bound `engine.pika` / `engine.typegen` capabilities. `order` still controls plugin lifecycle ordering, but it is not a mechanism for reaching mutable Core producer services.


### Register configuration inputs during initialization

If your plugin reads external files that define one Engine generation, register their **absolute file paths** during initialization:

```ts
defineEnginePlugin({
  name: 'my-plugin',
  configureEngine(engine) {
    engine.runtime.addConfigDependency('/absolute/path/to/tokens.json')
  },
})
```

Directory-membership semantics use the separate initialization-only `addConfigDirectoryMembershipDependency()` capability when direct member creation/deletion/rename affects configuration.

Config dependencies are frozen when Engine initialization completes. Calling either registration API later from `engine.use()`, a resolver, or another runtime phase is an error. Integration combines these frozen Engine dependencies with canonical config-module dependencies when deriving the complete `ProjectGeneration` watch set.


## Testing a Plugin

Plugin hooks are plain functions, so most plugin behavior tests need no real engine — mirror the official `@pikacss/plugin-reset` test (`packages/plugin-reset/src/index.test.ts`): call the hooks directly with a minimal mock and assert the effects. Build **one base context per simulated engine** (`{ onDiagnostic, state: plugin.createState?.(), host: {} }`) and reuse its state/host/diagnostic values across that engine's hook calls. `configureEngine` is the exception to the ordinary hook shape: it receives one `EngineConfigurator`, so a direct unit test composes the same base context with `runtime` (and owner-bound `pika` / `typegen` capabilities when the plugin uses them).

```ts
import { describe, expect, it, vi } from 'vitest'
import { myPlugin } from './index'

function createContext(plugin: any) {
  return { onDiagnostic: vi.fn(), state: plugin.createState?.(), host: {} }
}

describe('myPlugin', () => {
  it('registers its layer and preflight', async () => {
    const plugin = myPlugin()
    const context = createContext(plugin)
    const runtime = { addPreflight: vi.fn() }
    const config: Record<string, any> = {}

    plugin.configureRawConfig?.(config as any, context)
    await plugin.configureEngine?.({
      ...context,
      runtime,
      pika: { extendStatic: vi.fn() },
      typegen: { add: vi.fn() },
    } as any)

    expect(config.layers).toEqual({ 'my-layer': 5 })
    expect(runtime.addPreflight).toHaveBeenCalled()
  })
})
```

For end-to-end assertions on generated CSS, create a real engine instead: `const engine = await createEngine({ plugins: [myPlugin()] })`, then `await engine.use({ ... })` and snapshot `await engine.renderAtomicStyles(true)`.

## Next

- [Available Hooks](/plugin-development/available-hooks) — all lifecycle hooks you can implement.
- [Type Augmentation](/plugin-development/type-augmentation) — extend PikaCSS types for your plugin.
- [Define Helpers](/plugin-development/define-helpers) — `defineEngineConfig` and `defineEnginePlugin`.
