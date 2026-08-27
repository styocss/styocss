---
title: Type Augmentation
description: Extend EngineConfig/Engine types and contribute generated authoring types through the Typegen manager.
relatedPackages:
  - '@pikacss/core'
relatedSources:
  - 'packages/core/src/plugin.ts'
  - 'packages/core/src/typegen/registry.ts'
  - 'packages/core/src/pika.ts'
  - 'packages/core/src/types/shared.ts'
category: plugin-development
order: 30
---

# Type Augmentation

Plugins may augment stable runtime/config interfaces with normal TypeScript module augmentation. Generated `pika()` authoring types use the Engine-owned Typegen manager instead of a global autocomplete augmentation pool.

## EngineConfig

`EngineConfig` is the supported plugin-configuration augmentation anchor:

```ts
declare module '@pikacss/core' {
  interface EngineConfig {
    myPlugin?: {
      enabled?: boolean
      theme?: 'light' | 'dark'
    }
  }
}
```

Consumers configure it inside the project entry's `engine` field:

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  engine: {
    plugins: [myPlugin()],
    myPlugin: {
      enabled: true,
      theme: 'dark',
    },
  },
})
```

Inside the plugin, prefer `configureRawConfig` to lower plugin-owned options into existing Core semantic domains. This keeps runtime behavior and generated Typegen under one owner:

```ts
defineEnginePlugin({
  name: 'my-plugin',
  configureRawConfig(config) {
    if (!config.myPlugin?.enabled)
      return

    config.selectors = {
      definitions: [
        ...(config.selectors?.definitions ?? []),
        { name: '@my-theme', value: 'html[data-theme] $' },
      ],
    }
  },
})
```

## Engine

A plugin that intentionally exposes a runtime/tooling capability may augment `Engine`:

```ts
declare module '@pikacss/core' {
  interface Engine {
    getTheme: () => string
  }
}
```

`configureEngine` receives an `EngineConfigurator`; mutate the underlying runtime through `engine.runtime`:

```ts
defineEnginePlugin({
  name: 'my-plugin',
  configureEngine(engine) {
    engine.runtime.getTheme = () => 'dark'
  },
})
```

Keep this for genuine runtime/tooling APIs. Semantic selector/shortcut/variable/keyframe producers should be lowered through config rather than exposing another mutable producer ingress.

## Generated authoring types

The old global `Autocomplete` / `DefineAutocomplete` / `appendAutocomplete()` architecture is removed. `PikaAugment` still exists only as transitional generated-file plumbing; it is **not** a plugin authoring API.

There are two supported patterns.

### Prefer an existing semantic subsystem

If your feature is a selector, shortcut, variable, keyframe, token constraint, etc., lower definitions in `configureRawConfig`. The owning Core subsystem then generates the appropriate Typegen and runtime semantics together.

For dynamic selectors/shortcuts, put the accepted raw TypeScript family in `inputType` and deterministic concrete completions in `autocomplete`:

```ts
config.shortcuts = {
  definitions: [
    ...(config.shortcuts?.definitions ?? []),
    {
      pattern: /^my-gap-(.+)$/,
      inputType: '`my-gap-${string}`',
      resolve: ([, value]) => ({ gap: value }),
      autocomplete: ['my-gap-1rem', 'my-gap-2rem'],
    },
  ],
}
```

### Register plugin-owned Typegen during `configureEngine`

For a genuinely new authoring surface, use the owner-bound `engine.typegen` capability. Registration is initialization-only and closes when that plugin's `configureEngine` invocation settles:

```ts
defineEnginePlugin({
  name: 'my-plugin',
  configureEngine(engine) {
    engine.typegen.add({
      id: 'my-plugin:authoring',
      declarations: 'interface __MyPluginTheme { current: "dark" | "light" }',
      pika: {
        theme: '__MyPluginTheme',
      },
    })
  },
})
```

If the same first-level Pika root has runtime semantics, the same plugin must own both sides. Register its static implementation with `engine.pika.extendStatic(...)` in the same `configureEngine` lifecycle:

```ts
configureEngine(engine) {
  engine.pika.extendStatic('theme', { current: 'dark' })
  engine.typegen.add({
    id: 'my-plugin:theme',
    declarations: 'interface __MyPluginTheme { current: "dark" | "light" }',
    pika: { theme: '__MyPluginTheme' },
  })
}
```

Static extensions are compile-time authoring helpers valid only inside the bounded-static argument tree of the base `pika(...)` call. They are not general runtime macros.

## Direct `createEngine()` tests

An Engine's `typegen.snapshot` is always finalized as part of Engine creation, even without a bundler. Integration/hosts later render one or more snapshots into `<stateDir>/pika.gen.ts`. Tests can therefore assert semantic Typegen contributions directly without inventing a manual `PikaAugment` declaration.

## Next

- [Create a Plugin](/plugin-development/create-a-plugin)
- [Available Hooks](/plugin-development/available-hooks)
- [Autocomplete](/customizations/autocomplete)
