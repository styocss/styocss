# Plugin Development

> Read this when creating or modifying a PikaCSS engine plugin, selecting lifecycle hooks, extending config types, reporting diagnostics, loading external files, designing runtime adapters, or writing plugin tests.

## Plugin Structure

Plugins are plain objects created with `defineEnginePlugin`. Hooks are direct object methods; there is no `setup()` wrapper.

```ts
import type { EnginePlugin } from '@pikacss/core'
import { defineEnginePlugin } from '@pikacss/core'

export function myPlugin(): EnginePlugin {
  return defineEnginePlugin({
    name: 'my-plugin',
    order: 'pre',

    configureRawConfig(config, context) {
      // Compose defaults before config resolution.
      return config
    },

    async configureEngine(engine) {
      // Register runtime behavior through the owner-bound configurator.
      engine.runtime.reportDiagnostic({
        level: 'warning',
        code: 'my-plugin-example',
        message: 'Example diagnostic',
        plugin: 'my-plugin',
      })
    },
  })
}
```

Keep factory names consistent across implementation, consumer examples, and tests. If the factory is `myPlugin`, always show `plugins: [myPlugin()]`.

## Ordering

Plugin order tiers are:

1. `'pre'`
2. Default (`undefined`)
3. `'post'`

Original array order is preserved within a tier. There is no `'normal'` value.

Core plugins are installed automatically by `createEngine`; application plugins are combined with them and sorted by these tiers.

## Hook Context and Diagnostics

Payload lifecycle hooks receive an `EnginePluginContext` as their final argument. `configureEngine` is the exception: it receives one owner-bound `EngineConfigurator`, which already includes `state`, `host`, and `onDiagnostic` plus `runtime`, `pika`, and `typegen` capabilities:

```ts
interface EnginePluginContext {
  onDiagnostic: DiagnosticHandler
}
```

For ordinary payload hooks, the context is the second argument. For payload-less notification hooks, it is the first argument. Do not pass a second context argument to `configureEngine`.

```ts
configureRawConfig(config, context) {
  context?.onDiagnostic({
    level: 'warning',
    code: 'my-plugin-deprecated-option',
    message: 'The old option is deprecated.',
    plugin: 'my-plugin',
    hook: 'configureRawConfig',
  })
}

preflightUpdated(context) {
  // context?.onDiagnostic(...)
}
```

Diagnostics are structured data. Do not assume `console`, Node.js, or a browser exists in a core plugin. Include a stable `code`, human-readable `message`, severity, and relevant `plugin`, `hook`, or `cause` metadata.

A host diagnostic handler is isolated: if it throws, it does not replace the engine result. A plugin hook that throws is reported as a `plugin-hook-error` diagnostic and then rethrown; failed lifecycle execution is not silently converted into a partial result.

## Per-Engine State (#116)

A plugin object is a reusable **definition** across sequential and concurrent engines. Mutable per-engine data must never live in the factory closure — declare it with `createState?: () => State` on the plugin and access it via `context.state` (the context is the last parameter of every hook; one context object exists per plugin/engine pair and is stable across all of that pair's hook invocations). Long-lived callbacks the plugin registers (shortcut resolvers, preflight functions, engine service methods) must capture the context or values derived from it, never mutable closure variables. Immutable factory arguments may stay in the closure; a process-global cache is acceptable only when its key covers every semantic input. Stateless plugins omit `createState`. `defineEnginePlugin` infers the state type from `createState`'s return value. The context also carries `host: EngineHostContext` (#118) — `host.projectRoot` is the engine's effective project root supplied by the bundler integration (Vite root, Nuxt rootDir); plugins loading project-relative resources must resolve against it, falling back to a runtime cwd only for standalone use.

## Lifecycle Hooks

| Hook | Signature | Primary use |
|---|---|---|
| `configureRawConfig` | `(config, context) => Awaitable<EngineConfig | void>` | Add defaults or lower plugin semantics into raw config |
| `rawConfigConfigured` | `(config, context) => EngineConfig | void` | Observe finalized raw config |
| `configureResolvedConfig` | `(resolvedConfig, context) => Awaitable<ResolvedEngineConfig | void>` | Adjust fully resolved config |
| `configureEngine` | `(engine: EngineConfigurator<State>) => Awaitable<void>` | Register initialized runtime behavior, Pika static roots, Typegen, preflights, or config dependencies |
| `transformSelectors` | `(selectors, context) => Awaitable<string[] | void>` | Transform resolved selector strings |
| `transformStyleItems` | `(styleItems, context) => Awaitable<ResolvedStyleItem[] | void>` | Modify/expand provisional style items |
| `transformStyleDefinitions` | `(definitions, context) => Awaitable<ResolvedStyleDefinition[] | void>` | Modify flattened provisional style definitions |
| `transformStyleContents` | `(contents, context) => Awaitable<StyleContent[] | void>` | Rewrite/expand normalized contents before atomic ID allocation |
| `preflightUpdated` | `(context) => void` | Observe preflight-affecting committed state changes |
| `atomicStyleAdded` | `(atomicStyle, context) => AtomicStyle | void` | Observe a newly registered atomic style after commit |

For payload hooks, returning `undefined` or `null` keeps the current payload. Returning a replacement payload pipes it into the next plugin.

### Configuration phase

The engine lifecycle is:

1. `configureRawConfig`
2. `rawConfigConfigured`
3. Core config resolution
4. `configureResolvedConfig`
5. Engine construction
6. `configureEngine`

Use `configureRawConfig` to lower plugin semantics into existing Core domains. Config-backed selectors, shortcuts, variables, and keyframes have no public runtime `.add()` producer ingress.

```ts
return defineEnginePlugin({
  name: 'my-plugin',

  configureRawConfig(config) {
    config.layers ??= {}
    config.layers.myLayer ??= 5
    config.selectors = {
      definitions: [
        ...(config.selectors?.definitions ?? []),
        { name: '@reduced-motion', value: '@media (prefers-reduced-motion: reduce)' },
      ],
    }
    config.shortcuts = {
      definitions: [
        ...(config.shortcuts?.definitions ?? []),
        { name: 'my-stack', value: { display: 'flex', flexDirection: 'column' } },
      ],
    }
  },

  configureEngine(engine) {
    engine.runtime.addPreflight({
      id: 'my-plugin-base',
      layer: 'myLayer',
      preflight: '*, *::before, *::after { box-sizing: border-box; }',
    })
    engine.runtime.appendCssImport('@import url("https://example.test/fonts.css")')
  },
})
```

`configureEngine` receives an owner-bound `EngineConfigurator`, not the raw Engine. Important members:

| Member | Purpose |
|---|---|
| `engine.runtime` | Underlying Engine runtime APIs |
| `engine.pika.extendStatic(name, value)` | Register one plugin-owned first-level static Pika authoring root during initialization |
| `engine.typegen.add(contribution)` | Register plugin-owned Typegen metadata during initialization |
| `engine.state` | Engine-local plugin state |
| `engine.host` | Immutable Engine host context |
| `engine.onDiagnostic` | Structured diagnostic sink |

If a plugin creates a new Pika static root, runtime and Typegen ownership must agree:

```ts
configureEngine(engine) {
  engine.pika.extendStatic('theme', { current: 'dark' })
  engine.typegen.add({
    id: 'my-plugin:theme',
    declarations: 'interface __MyTheme { current: "dark" | "light" }',
    pika: { theme: '__MyTheme' },
  })
}
```

Static Pika extensions are compile-time helpers valid only inside a base `pika(...)` bounded-static argument tree.

### Transform phase

Transform hooks run during provisional Engine style preparation. They must not assume that execution means the module will commit:

```ts
return defineEnginePlugin({
  name: 'my-transform',
  transformStyleItems(styleItems) {
    return styleItems
  },
  transformStyleDefinitions(definitions) {
    return definitions
  },
  transformStyleContents(contents) {
    return contents
  },
})
```

`transformStyleContents` is the normalized pre-commit 1→1 / 1→N rewrite seam. A failure aborts preparation with no new committed atomic state.

### Notification hooks

`preflightUpdated` and `atomicStyleAdded` are committed notifications. `atomicStyleAdded` observes an atomic style after registration; do not mutate it or treat a thrown observer as a rollback mechanism.

## Engine API

Inside `configureEngine`, stable runtime methods are accessed through `engine.runtime`:

| Method | Purpose |
|---|---|
| `engine.runtime.addPreflight(...)` | Add preflight CSS |
| `engine.runtime.appendCssImport(...)` | Add raw CSS `@import` |
| `engine.runtime.addConfigDependency(path)` | Register an absolute file configuration dependency during initialization |
| `engine.runtime.addConfigDirectoryMembershipDependency(path)` | Register direct directory membership as an initialization dependency |
| `engine.runtime.reportDiagnostic(...)` | Emit a structured diagnostic |

Read-side/test APIs such as `engine.runtime.renderPreflights()`, `renderAtomicStyles()`, `renderLayerOrderDeclaration()`, and `engine.runtime.typegen.snapshot` remain on the underlying Engine.

Do not recommend runtime semantic producer APIs for selectors/shortcuts/variables/keyframes; append their canonical object definitions in `configureRawConfig`.

## External File Dependencies

Configuration dependencies are **initialization-only** and freeze with the Engine generation:

```ts
configureEngine(engine) {
  engine.runtime.addConfigDependency('/project/design/tokens.json')
}
```

Register every external file whose content/existence determines Engine semantics. Use the directory-membership primitive when direct member create/delete/rename events define a catalog. Relative paths should be resolved using the plugin's host/project semantics before registration; the Engine API accepts the canonical path contract required by the feature.

Do not register dependencies during `engine.use()`, shortcut/selector resolution, or other runtime phases. Late registration is an error and does not dynamically expand an active watcher. Integration combines finalized Engine dependencies with Config-host dependencies into each `ProjectGeneration` watch set.

## Platform-Neutral Plugins and Runtime Adapters

Keep the neutral entry free of unconditional Node.js/browser APIs. Inject host capabilities into the plugin factory and expose platform adapters as explicit subpath exports when necessary.

```ts
export interface MyRuntimeOptions {
  readFile?: (absolutePath: string) => Promise<string>
  cwd?: () => string
}

export function myPlugin(runtime: MyRuntimeOptions = {}): EnginePlugin {
  // Use only supplied capabilities here.
  return defineEnginePlugin({
    name: 'my-plugin',
  })
}
```

```ts
// node.ts
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { myPlugin as createMyPlugin } from './index'

export * from './index'

export function myPlugin() {
  return createMyPlugin({
    readFile: path => readFile(path, 'utf8'),
    cwd: () => process.cwd(),
  })
}
```

Use a package export such as `./node` for the adapter. This keeps core behavior reusable in neutral hosts and makes platform capabilities explicit to consumers.

## Config Augmentation

Extend `EngineConfig` through module augmentation:

```ts
export interface MyPluginConfig {
  enabled?: boolean
  source?: string
}

declare module '@pikacss/core' {
  interface EngineConfig {
    myPlugin?: MyPluginConfig
  }
}
```

Consumers import the plugin package, which loads the augmentation:

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'
import { myPlugin } from 'my-plugin'

export default defineConfig({
  engine: {
    plugins: [myPlugin()],
    myPlugin: {
      enabled: true,
      source: './my-plugin.json',
    },
  },
})
```

Keep runtime behavior gated by plugin registration. Importing a package may make types visible, but configuration should not take effect unless the factory is in `plugins`.

Plugins may also augment `Engine` when they install a runtime service, but initialize the property before another hook can consume it and document ordering requirements.

## Testing

Use `createEngine` from `@pikacss/core`.

```ts
import type { Diagnostic } from '@pikacss/core'
import { createEngine, defineEngineConfig } from '@pikacss/core'
import { expect, it } from 'vitest'
import { myPlugin } from '../src'

it('registers its preflight', async () => {
  const engine = await createEngine(defineEngineConfig({
    plugins: [myPlugin()],
  }))

  expect(await engine.renderPreflights(false)).toContain('box-sizing:border-box')
})

it('registers shortcuts', async () => {
  const engine = await createEngine({
    plugins: [myPlugin()],
  })

  await engine.use('my-stack')
  expect(await engine.renderAtomicStyles(false)).toContain('display:flex')
})

it('emits structured diagnostics', async () => {
  const diagnostics: Diagnostic[] = []

  await createEngine({
    plugins: [myPlugin()],
  }, {
    onDiagnostic: diagnostic => diagnostics.push(diagnostic),
  })

  expect(diagnostics).toContainEqual(expect.objectContaining({
    code: 'my-plugin-example',
    plugin: 'my-plugin',
  }))
})

it('registers external dependencies', async () => {
  const engine = await createEngine({
    plugins: [myPlugin()],
  })

  expect(engine.configDependencies).toContain('/project/design/tokens.json')
})
```

### Test checklist

- Normal config and default behavior.
- Config augmentation typechecks.
- Every diagnostic branch asserts stable codes and metadata.
- External files appear in `engine.configDependencies`.
- Hook ordering is tested with multiple small spy plugins.
- Returning replacement hook payloads is covered when used.
- Thrown hooks reject engine creation and produce the expected `plugin-hook-error` diagnostic.
- Neutral entry tests do not require Node globals; platform adapters receive separate tests.
- Render unformatted CSS for simpler assertions unless formatting itself is under test.
