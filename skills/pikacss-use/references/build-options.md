# Build Plugin Options

> Read this when the user asks about build-tool setup, scan patterns, project roots, output formats, generated paths, custom function names, wrapper integrations, HMR, or config reload behavior.

## Compatibility

- PikaCSS packages require Node.js 22 or later.
- The Vite adapter supports Vite 7 and 8 (`^7.0.0 || ^8.0.0`).
- Supported unplugin exports: Vite, Rollup, Webpack, esbuild, Rspack, and Rolldown.
- Nuxt projects should use `@pikacss/nuxt-pikacss`; do not also register the Vite adapter manually.

## Basic Configuration

```ts
import pikacss from '@pikacss/unplugin-pikacss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    pikacss({
      // Defaults are sufficient for most projects.
      fnName: 'pika',
      transformedFormat: 'string',
      scan: {
        include: ['**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,vue}'],
        exclude: [
          'node_modules/**',
          'dist/**',
          '.git/**',
          '.nuxt/**',
          '.output/**',
          'coverage/**',
        ],
      },
    }),
  ],
})
```

## Option Reference

| Option | Type | Default | Purpose |
|---|---|---|---|
| `cwd` | `string` | Bundler root, then `process.cwd()` | Working directory for config discovery, scan globs, and codegen paths |
| `scan.include` | `string \| string[]` | `**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,vue}` | Source globs to scan |
| `scan.exclude` | `string \| string[]` | Dependencies, output, VCS, Nuxt, and coverage globs | Source globs to exclude |
| `config` | `EngineConfig \| string` | Auto-discovery | Inline engine config or path to a config file |
| `autoCreateConfig` | `boolean` | `false` | Opt in to scaffolding `pika.config.js` when no config exists |
| `fnName` | `string` | `'pika'` | Base compile-time function name; preview and `.str`/`.arr` variants derive from it |
| `transformedFormat` | `'string' \| 'array'` | `'string'` | Default output format for the base function |
| `tsCodegen` | `boolean \| string` | `true` → `pika.gen.ts` | Redirect or disable TypeScript declaration generation |
| `currentPackageName` | `string` | `'@pikacss/unplugin-pikacss'` | Package identity embedded in generated declarations/config scaffolds; wrapper integrations only |

### Important override semantics

Explicit `scan.include` and `scan.exclude` values **replace** their corresponding defaults. They are not merged. If a user supplies a custom exclusion list, remind them to retain every exclusion they still need.

`cwd` resolution priority is:

1. Explicit `cwd` option.
2. Bundler root/context where an adapter exposes one.
3. `process.cwd()`.

Use `currentPackageName` only when publishing a wrapper integration. It must name the package users actually import; normal applications should leave it untouched.

## Supported Source Files

The built-in AST processors support:

- `js`, `mjs`, `cjs`, `jsx`
- `ts`, `mts`, `cts`, `tsx`
- Vue SFCs (`vue`)

Svelte, Astro, and plain HTML are not processed. Narrowing scan globs to an unsupported extension does not add compiler support.

```ts
pikacss({
  scan: {
    include: ['src/**/*.{ts,tsx,vue}', 'shared/**/*.mts'],
  },
})
```

## Generated Files

The default generated paths are convenience defaults rather than required names:

```ts
pikacss({
  tsCodegen: './src/generated/pika.gen.ts',
})
```

- `import 'pika.css'` is the public virtual CSS import; it resolves to the current run's internal runtime CSS under `.pikacss/` and is not configurable.
- `tsCodegen: false` disables declaration generation and therefore removes generated global types and `pikap` hover output.
- `autoCreateConfig` is intentionally opt-in because silent repository writes are unsafe in CI, containers, and read-only workspaces.

## Output Format

```ts
pikacss({ transformedFormat: 'array' })
// pika({ display: 'flex' }) → ['pk-a1b2']
```

Call-site variants override the default:

- `.str()` always produces a string.
- `.arr()` always produces an array.
- Preview variants follow the same rule.

## Custom Function Name

```ts
pikacss({ fnName: 'css' })
```

The generated globals become `css`, `css.str`, `css.arr`, `cssp`, `cssp.str`, and `cssp.arr`. Keep `@pikacss/eslint-config`'s `fnName` aligned with this value.

## Config Loading and Error Behavior

Config discovery only checks the project root and uses this priority:

1. `pika.config.{ts,mts,cts,js,mjs,cjs}`
2. `pikacss.config.{ts,mts,cts,js,mjs,cjs}`

When multiple candidates exist, the first is used and the others are logged as ignored with a warning. Recommend keeping at most one config file.

- Production builds throw on invalid config or engine initialization.
- Development retains the last successfully initialized engine after a transient config error so the server can continue running.

## HMR and Watching

The integrations automatically handle:

- CSS updates after transformed source changes.
- Config file reloads.
- External config dependencies registered by plugins through `engine.addConfigDependency(path)`.
- Debounced generated-file writes.

A plugin that reads an external file must register that path, including a missing path that should trigger reload when later created. Without registration, changing the external file does not recreate the engine.

## Nuxt-Specific Behavior

`@pikacss/nuxt-pikacss`:

- Registers the Vite adapter internally.
- Uses the unplugin's default JS-family and Vue scan patterns, including `.nuxt` and `.output` exclusions.
- Resolves config discovery and generated paths from Nuxt's project root instead of Vite's `srcDir` root.
- Generates a Nuxt plugin/template that imports `pika.css`.
- Sets its own integration package identity for generated output.

Do not recommend a manual `import 'pika.css'` or a duplicate Vite plugin in Nuxt projects.
