# PikaCSS Playground

An in-browser playground for PikaCSS, built with Vue 3, [WebContainers](https://webcontainers.io/), Monaco, and dockview. It boots a real Vite project inside the browser, installs dependencies with npm, and runs the dev server — so the full PikaCSS transform/codegen pipeline works exactly like a local setup.

## Templates

| Template | Framework | Entry |
|---|---|---|
| `solid-ts` (default) | SolidJS + TSX | `src/App.tsx` |
| `vue-ts` | Vue 3 SFC | `src/App.vue` |
| `react-ts` | React 19 | `src/App.tsx` |

Templates live in `src/templates/<name>/` and are bundled into virtual modules by `plugins/vite-plugin-vfs.ts`. Each template is a standalone Vite project wired with `@pikacss/unplugin-pikacss`. The WebContainer installs from the npm registry; the dependency version is rewritten to the latest published release at build time (see below). Template edits are persisted into the URL hash (lz-string compressed) so playground states are shareable.

## Development

```bash
pnpm --filter @pikacss/playground dev
pnpm --filter @pikacss/playground build
# Requires generated files (pika.gen.ts / vfs.d.ts); run dev or build first:
pnpm --filter @pikacss/playground type-check
```

## Deployment

Deployed to `https://pikacss.github.io/playground/` by `.github/workflows/deploy-docs.yml`, which copies the built output into the docs dist under `playground/`. GitHub Pages cannot send the COOP/COEP headers WebContainers require, so `public/coi-serviceworker.min.js` installs a service worker that injects them (`index.html` loads it first).

## Notes for maintainers

- `src/templates/**` is data, not app code: it is excluded from the app tsconfig, from the repo ESLint run, and from the playground's own PikaCSS scan (`vite.config.ts` → `scan.exclude`).
- Template `package.json` files reference **published** `@pikacss/*` versions (`workspace:` cannot resolve inside the WebContainer). At build/dev time, `vite.config.ts` resolves the **latest published version** from the npm registry and rewrites the template dependency via `vfsPlugin`'s `dependencyVersions` option; the pinned version in the repo is only the offline fallback.
- The `type-check` script (hyphenated, like `demo/`) is intentionally not part of the repo-wide `pnpm typecheck`, because it needs generated files from a prior dev/build run.
- The template is taken from the path (`/playground/<template>/`). GitHub Pages is a static server with **no SPA fallback**, so `vite-plugin-template-pages` emits a real `index.html` per template at build time and turns the bare `/playground/` into a redirect to `solid-ts/` (Vite dev/preview hide the need for this because they *do* fall back to `index.html`). The redirect preserves query + hash so shared links and `?__generate` keep working.
- The preview iframe is reloaded once (`PreviewPanel.vue`): the server signals `server-ready` before PikaCSS has generated the runtime `pika.css`, so the first paint is unstyled and Vite's CSS HMR does not retroactively style it. The reload is triggered by the first `hmr update … pika.css` line in the terminal output (CSS is ready by then), with a timed fallback — a fixed delay is unreliable because the cache path below reaches the dev server much faster.
- **Dependency snapshots** — the ~90s in-browser `npm install` is skipped by mounting a snapshot of `node_modules` instead. Every snapshot is a gzip of `webcontainer.export('.', { format: 'binary' })`, i.e. WebContainer's **own** filesystem (its WASM-swapped rollup/esbuild); this is the only thing that re-mounts correctly — a host `npm install` does **not** work (see the repo `AGENTS.md`). On mount the executable bit is lost, so the runtime runs `chmod -R +x node_modules`. Two layers, checked in order (`App.vue` → `useSnapshotCache.ts` / `useWebContainer.ts`), both falling back to a normal install:
  1. **Static baseline** (`snapshots/<template>.bin`) — generated in CI (`scripts/gen-snapshots.mjs`, see below) and shipped as a static asset, so the **first** visit is fast (~6s) for everyone.
  2. **Per-visitor cache** (IndexedDB, keyed by `<template>@<package.json hash>`) — after a first install (when no static baseline exists), the app exports + caches the result for that browser's next visit.
- **Snapshot generation** (`scripts/gen-snapshots.mjs`): WebContainer only runs in a browser, and its `spawn` only works inside the full app (not a stripped page), so the generator drives the **built playground** in headless Chromium (Playwright). For each template it opens `?__generate&template=<name>` — which runs a fresh install and exposes the gzip export on `window.__pikaSnapshot` — and writes `dist/snapshots/<template>.bin`. Run after `pnpm build`; the deploy workflow does this automatically (non-fatal — a flaky run just falls back to on-demand install). The static `.bin` files are build artifacts (not committed).
