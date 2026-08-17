---
title: SSR & Production
description: Why server-side rendering needs no special handling, and what to expect from PikaCSS in dev and production builds.
relatedPackages:
  - '@pikacss/unplugin-pikacss'
  - '@pikacss/integration'
  - '@pikacss/nuxt-pikacss'
relatedSources:
  - 'packages/unplugin/src/index.ts'
  - 'packages/integration/src/ctx.ts'
  - 'packages/nuxt/src/index.ts'
category: integrations
order: 24
---

# SSR & Production

PikaCSS output is a static CSS file produced at build time. That single fact answers most SSR and production questions.

## SSR, SSG, and Streaming Just Work

There is no runtime style injection and no style registry to flush:

- Every `pika()` call is replaced with a class-name string literal during the build — components render plain strings on the server exactly as they do in the browser.
- All generated styles live in one runtime CSS file owned by the current run (internal PikaCSS state under `.pikacss/`). The `import 'pika.css'` specifier resolves to that file, and your bundler handles it like any other stylesheet import.

So server-side rendering, static site generation, and streaming responses need no PikaCSS-specific handling: if your setup can serve a regular imported stylesheet, it can serve PikaCSS. There is no `extractCriticalToChunks`, no `ServerStyleSheet`, no hydration mismatch surface from styling.

For Nuxt specifically, the `@pikacss/nuxt-pikacss` module registers a Nuxt plugin template whose only job is `import "pika.css"` — nothing else is added to the server or client runtime. See [Nuxt](/integrations/nuxt).

## Production Builds

In build mode the plugin scans all files matched by `scan.include` up front, collects every `pika()` usage, and writes the complete CSS file before bundling continues. The output contains:

- the `@layer` order declaration,
- preflights (with unused variables and keyframes pruned),
- the deduplicated atomic classes — sized by unique declarations, not call sites (see [How PikaCSS Generates CSS](/getting-started/how-pikacss-generates-css)).

The result passes through your bundler's normal CSS pipeline (minification, hashing, code splitting) untouched by PikaCSS.

## What Triggers a Reload in Dev

The dev server re-creates the engine (and regenerates both output files) when:

- **The config file changes.** The resolved `pika.config.*` file is watched. Only a *content* change counts — saving without editing anything, or a change that leaves the bytes identical, is ignored.
- **A config dependency changes.** Plugins that load external files register them via `engine.addConfigDependency(path)` — for example, [@pikacss/plugin-design-tokens](/official-plugins/design-tokens) registers its token source files. Those paths are watched the same way as the config file, content comparison included.

Both paths rely on the bundler's file watcher (esbuild is the exception — it has no watch-based reload path). Ordinary source edits do not re-create the engine; they only add or update the affected file's usages, and the generated files are rewritten only when the resolved styles actually changed.

**Re-creating the engine triggers a full page reload, not an HMR update** (Vite). Atomic class names are assigned in discovery order, so a fresh engine can hand the same name to a different declaration. Anything the browser still holds from the previous generation would then point at the wrong rule — silently, with no error — so the page is reloaded to keep the served modules and the regenerated CSS in the same generation. Expect to lose page state (form input, router position) when you edit your config.

A config file that fails to evaluate is the exception: the dev server keeps the last-good engine, so nothing is reassigned and the page is left alone. Fix the file and save again to pick it up.

## Type-Level Performance

The size of the generated `pika.gen.ts` (autocomplete unions, preview overloads) grows with your project. TypeScript type-system cost is tracked with an in-repo benchmark suite (`scripts/type-bench/`) that measures check time, instantiations, and IDE latency across usage scales and TS versions — so regressions in type performance are measured, not guessed. No absolute numbers are published because they depend heavily on project shape and hardware.

## Next

- [How PikaCSS Generates CSS](/getting-started/how-pikacss-generates-css) — the runtime model behind the output file.
- [Unplugin](/integrations/unplugin) — build-tool options including `scan` and `tsCodegen`.
- [Nuxt](/integrations/nuxt) — the Nuxt module's auto-wiring.
