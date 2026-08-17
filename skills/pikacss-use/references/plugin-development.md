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
      // Register runtime behavior after engine creation.
      engine.reportDiagnostic({
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

Every lifecycle hook receives an optional `EnginePluginContext`:

```ts
interface EnginePluginContext {
  onDiagnostic: DiagnosticHandler
}
```

For hooks with payloads, it is the second argument. For payload-less notification hooks, it is the first argument.

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

## Lifecycle Hooks

| Hook | Signature | Primary use |
|---|---|---|
| `configureRawConfig` | `(config, context?) => Awaitable<EngineConfig \| void>` | Add defaults or compose raw user config |
| `rawConfigConfigured` | `(config, context?) => EngineConfig \| void` | Observe or synchronously adjust config after all raw-config hooks |
| `configureResolvedConfig` | `(resolvedConfig, context?) => Awaitable<ResolvedEngineConfig \| void>` | Adjust fully resolved config |
| `configureEngine` | `(engine, context?) => Awaitable<Engine \| void>` | Register engine services, preflights, resolvers, autocomplete, imports, or dependencies |
| `transformSelectors` | `(selectors, context?) => Awaitable<string[] \| void>` | Transform resolved selector strings |
| `transformStyleItems` | `(styleItems, context?) => Awaitable<ResolvedStyleItem[] \| void>` | Modify or expand resolved style items |
| `transformStyleDefinitions` | `(definitions, context?) => Awaitable<ResolvedStyleDefinition[] \| void>` | Modify flattened style definitions |
| `transformStyleContents` | `(contents, context?) => Awaitable<StyleContent[] \| void>` | Rewrite/expand normalized atomic contents (1→1 or 1→N) before any ID is allocated — compatibility lowering, logical-property transforms, custom prefixing |
| `preflightUpdated` | `(context?) => void` | Observe changes affecting rendered preflight CSS |
| `atomicStyleAdded` | `(atomicStyle, context?) => AtomicStyle \| void` | Observe a newly registered atomic style — a committed notification: the style is already registered, mutating the payload is unsupported, and a thrown error is diagnosed but never rolls back the commit |
| `autocompleteConfigUpdated` | `(context?) => void` | Observe autocomplete changes |

For payload hooks, returning `undefined` or `null` keeps the current payload. Returning a replacement payload pipes it into the next plugin.

### Configuration phase

The engine runs:

1. `configureRawConfig`
2. `rawConfigConfigured`
3. Core config resolution
4. `configureResolvedConfig`
5. Engine construction
6. `configureEngine`

Use `configureRawConfig` when the plugin's feature must participate in normal core config resolution. Use `configureEngine` when registering runtime state or services on the initialized engine.

```ts
return defineEnginePlugin({
  name: 'my-plugin',
  order: 'pre',

  configureRawConfig(config) {
    config.layers ??= {}
    config.layers.myLayer ??= 5
  },

  configureEngine(engine) {
    engine.addPreflight({
      id: 'my-plugin-base',
      layer: 'myLayer',
      preflight: '*, *::before, *::after { box-sizing: border-box; }',
    })

    engine.selectors.add(['@reduced-motion', '@media (prefers-reduced-motion: reduce)'])
    engine.shortcuts.add(['my-stack', { display: 'flex', flexDirection: 'column' }])
    engine.keyframes.add(['fade-in', {
      from: { opacity: '0' },
      to: { opacity: '1' },
    }])
    engine.variables.add({ '--my-color': 'rebeccapurple' })
    engine.appendCssImport('@import url("https://example.test/fonts.css")')
  },
})
```

### Transform phase

Transform hooks run whenever style calls are processed:

```ts
return defineEnginePlugin({
  name: 'my-transform',

  transformStyleItems(styleItems) {
    return styleItems
  },

  transformStyleDefinitions(definitions) {
    return definitions
  },

  transformSelectors(selectors) {
    return selectors
  },
})
```

Avoid mutating shared objects without a clear ownership contract. Returning a new array is easier to reason about when adding or removing items.

### Notification hooks

Notification hooks observe engine state changes. They should remain lightweight and must not assume their return value changes the caller's state.

## Engine API

Common methods available in `configureEngine`:

| Method | Purpose |
|---|---|
| `engine.addPreflight(preflight)` | Add raw, object, function, or wrapped preflight CSS |
| `engine.appendAutocomplete(contribution)` | Add selector, shortcut, property, CSS-property, value, or pattern completions |
| `engine.appendCssImport(cssImport)` | Add a raw CSS `@import` statement |
| `engine.selectors.add(...selectors)` | Register static/dynamic selector rules |
| `engine.shortcuts.add(...shortcuts)` | Register static/dynamic shortcut rules |
| `engine.keyframes.add(...keyframes)` | Register keyframe definitions |
| `engine.variables.add(variables)` | Register CSS variables and scopes |
| `engine.use(...styleItems)` | Resolve style items and register atomic styles |
| `engine.reportDiagnostic(diagnostic)` | Deliver a structured diagnostic through this engine's host handler |
| `engine.addConfigDependency(path)` | Register an external file that integrations must watch |

Rendering methods used primarily by tests and integrations:

| Method | Purpose |
|---|---|
| `engine.renderPreflights(isFormatted)` | Render imports, layers, and preflight-contributed CSS |
| `engine.renderAtomicStyles(isFormatted, options?)` | Render atomic utility CSS |
| `engine.renderLayerOrderDeclaration()` | Render the `@layer` ordering declaration |

## External File Dependencies

A plugin that reads files must register every resolved path:

```ts
configureEngine(engine) {
  engine.addConfigDependency('/project/design/tokens.json')
}
```

Official integrations watch `engine.configDependencies` and recreate the engine when a dependency changes. Register a missing expected path before reading it when creating that file later should also trigger reload.

Do not rely only on watching the main `pika.config.*` file. Without `addConfigDependency`, edits to secondary files remain invisible to the integration.

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
import { defineEngineConfig } from '@pikacss/core'
import { myPlugin } from 'my-plugin'

export default defineEngineConfig({
  plugins: [myPlugin()],
  myPlugin: {
    enabled: true,
    source: './my-plugin.json',
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
