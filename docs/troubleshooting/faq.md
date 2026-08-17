---
title: 'FAQ'
description: 'Frequently asked questions and troubleshooting tips for PikaCSS.'
relatedPackages:
  - '@pikacss/core'
  - '@pikacss/unplugin-pikacss'
  - '@pikacss/nuxt-pikacss'
  - '@pikacss/eslint-config'
relatedSources:
  - 'packages/core/src/engine.ts'
  - 'packages/core/src/types/engine.ts'
  - 'packages/core/src/plugins/selectors.ts'
  - 'packages/integration/src/ctx.ts'
  - 'packages/integration/src/ctx.transform-utils.ts'
  - 'packages/integration/src/tsCodegen.ts'
  - 'packages/unplugin/src/index.ts'
  - 'packages/unplugin/src/types.ts'
  - 'packages/nuxt/src/index.ts'
  - 'packages/eslint-config/src/rules/no-dynamic-args.ts'
  - 'packages/plugin-typography/src/index.ts'
  - 'packages/plugin-typography/package.json'
category: troubleshooting
order: 10
---

# FAQ

Common questions and solutions for PikaCSS.

## Why are my styles not appearing?

Make sure your application entry point imports the generated CSS module:

```ts
// main.ts
import 'pika.css'
```

`import 'pika.css'` resolves to the current run's generated runtime CSS, kept as internal PikaCSS state under `.pikacss/` in your project root. The location is not configurable and each dev server or build run owns its own file.

If you are using the Nuxt module, the import is injected automatically. With the generic unplugin integration, make sure you add the import yourself and that the plugin is registered in your build config.

## `ReferenceError: pika is not defined`

This runtime error means a `pika()` call reached the browser untransformed — `pika` only exists at compile time and has no runtime export. The most common cause is that the file is not matched by the scan globs, so the plugin never processed it. The default `scan.include` is `**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,vue}`, and the default `scan.exclude` skips `node_modules`, `dist`, `.git`, `.nuxt`, `.output`, and `coverage`.

Fixes:

1. If you set a custom `scan.include`, make sure it still matches the file — a custom value replaces the default verbatim rather than extending it. The default glob already covers every extension the transform supports (the JS family plus Vue SFCs); other extensions cannot be transformed even if you add them.
2. Check that the file does not live under an excluded path (`node_modules`, `dist`, `.git`, `.nuxt`, `.output`, `coverage`). If you set a custom `scan.exclude`, confirm it does not accidentally match the file.
3. Confirm the PikaCSS plugin is actually registered in your build config.

## `Cannot find name 'pika'`

This TypeScript error means the generated `pika.gen.ts` declaration file is not part of your TypeScript program — either it was never generated (run the dev server or a build once), or your tsconfig `include` does not cover it. By default the file is written to the project root, which a stock `"include": ["src"]` does not pick up.

Either point the output into `src/` with `tsCodegen: './src/pika.gen.ts'`, or add `pika.gen.ts` to your tsconfig `include`. See [Generated Files](/getting-started/setup#generated-files) for the full recipes.

## Why do I get "no-dynamic-args" ESLint errors?

The `pikacss/no-dynamic-args` rule requires each argument passed to `pika()` to stay within the same static subset the build-time compiler can evaluate. That includes literals, nested object/array literals, and operator expressions — conditional (`a ? b : c`), binary (`+ - * / === !==`), logical (`&& || ??`), template literals, and unary `! + - void` — **as long as every operand is itself static**. Anything that depends on runtime values (plain variables, member/function-call results, or an operator expression with a runtime operand) is rejected. A `pika` that is a local binding (import, variable, parameter) is treated as your own function, not the macro, and is left alone. Extract the dynamic part into separate `pika()` calls and combine the resulting class names at the call site:

```ts
// ❌ Invalid — conditional argument
pika(isDark ? { color: 'white' } : { color: 'black' })

// ✅ Valid — separate calls, combine at call site
const className = isDark
  ? pika({ color: 'white' })
  : pika({ color: 'black' })
```

## How do I change the layer order?

Define a custom `layers` map in your engine config. Lower numbers render earlier:

```ts
import { defineEngineConfig } from '@pikacss/core'

export default defineEngineConfig({
  layers: {
    reset: -1,
    preflights: 1,
    components: 5,
    utilities: 10,
  },
})
```

See [Layers](/customizations/layers) for a full example.

## Can I use PikaCSS without a build plugin?

Yes. `@pikacss/core` works without a bundler plugin. Create an engine, register styles with `await engine.use(...)`, then compose the CSS output from the layer declaration, preflights, and atomic styles:

<<< @/.examples/troubleshooting/without-build-plugin.example.ts#example

The unplugin integration adds HMR and static extraction but is not required. The Nuxt module also auto-injects the CSS import, while the generic unplugin integrations still expect you to add `import 'pika.css'` yourself.

## How do I add a custom pseudo-class or breakpoint?

Use the `selectors` config property to register custom selectors, including pseudo-classes and media-query responsive breakpoints:

```ts
import { defineEngineConfig } from '@pikacss/core'

export default defineEngineConfig({
  selectors: {
    definitions: [
      ['@dark', 'html.dark $'],
      ['@sm', '@media (min-width: 640px)'],
    ],
  },
})
```

See [Selectors](/customizations/selectors).

## TypeScript cannot find module augmentations from a plugin

Ensure the plugin package is installed and that your `tsconfig.json` uses a modern module resolution mode such as `moduleResolution: 'bundler'` or `'node16'` so TypeScript can follow the plugin package export map to its declaration file and `@pikacss/core` module augmentation:

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler"
  }
}
```

## Styles are not updating during development (HMR)

The PikaCSS Vite plugin handles HMR automatically. If styles are not updating:

1. Verify the plugin is registered in `vite.config.ts` with `PikaCSS()`.
2. Check that `import 'pika.css'` is present in your entry file.
3. Changing `pika.config.ts` should trigger a config reload automatically. If it does not, confirm you are editing the resolved config file path and that the saved file content actually changed.

## How do I combine PikaCSS classes conditionally?

By default, transformed `pika()` calls produce a plain class name string, so standard JavaScript composition works:

```ts
const base = pika({ display: 'flex', padding: '1rem' })
const active = pika({ color: 'blue' })
const inactive = pika({ color: 'gray' })

const className = `${base} ${isActive ? active : inactive}`
```

If your integration uses `transformedFormat: 'array'`, normal `pika()` calls return arrays instead. `pika.arr()` also forces array output, so compose those results with your framework's usual array-based class handling.

## Does PikaCSS work with SSR / SSG?

Yes. All styles are extracted at build time into one static generated stylesheet and every `pika()` call is replaced with plain class-name strings — there is no runtime style injection. Server-side rendering, static generation, and streaming need no special handling: the server just ships the same static stylesheet. The Nuxt module wires this up automatically by registering the Vite plugin and importing `pika.css` through a generated Nuxt plugin.

## Should I commit the generated files?

`pika.gen.ts` and the internal `.pikacss/` state directory are build artifacts regenerated on every dev or build run, so ignoring them is fine — as long as CI runs a build before any standalone typecheck, since `tsc --noEmit` needs `pika.gen.ts` to exist. If it does not, commit `pika.gen.ts`. See [Generated Files](/getting-started/setup#generated-files).

## Next

- [Getting Started](/getting-started/what-is-pikacss) — start from the beginning.
- [API Reference](/api/) — full API details.
