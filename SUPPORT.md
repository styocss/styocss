# Support & Compatibility Policy

## Module system: ESM-only

All `@pikacss/*` packages are **ESM-only**. They ship `"type": "module"`, import-only exports, and no CommonJS build.

- Package entry points require ESM-aware loading; there is no native CommonJS `require()` package entry point.
- The canonical Pika config host can evaluate supported CommonJS-shaped project config files when selected explicitly, and `pikacss init` intentionally emits a `require(...)`-based `pika.config.js` for CommonJS projects. That config-loader compatibility does not add CommonJS package builds.
- Type/package shape is validated with `publint` and `@arethetypeswrong/cli`.

## Node.js

- Supported: **Node.js >= 22**.
- Older majors are unsupported.

## Bundlers

PikaCSS uses Unplugin internally, but its supported product surface is deliberately limited to the Rollup and Webpack families.

| Family | Bundler | Entry | Status |
| --- | --- | --- | --- |
| Rollup | Vite | `@pikacss/unplugin-pikacss/vite` | Primary; Vite 7/8 peer, covered by tests/fixtures |
| Rollup | Rollup | `@pikacss/unplugin-pikacss/rollup` | Supported |
| Rollup | Rolldown | `@pikacss/unplugin-pikacss/rolldown` | Supported |
| Webpack | Webpack | `@pikacss/unplugin-pikacss/webpack` | Supported |
| Webpack | Rspack | `@pikacss/unplugin-pikacss/rspack` | Supported |

Other Unplugin hosts, including **esbuild, Farm, and Bun**, are unsupported and have no public PikaCSS adapter entry point. The package root is not a universal executable plugin; import an explicit supported bundler subpath.

Only Vite is declared as an optional peer dependency. Other supported hosts are not narrowly pinned as peers; consumers bring the host version already used by their project.

## Frameworks and source formats

- **Nuxt** via `@pikacss/nuxt-pikacss`.
- **Vue SFC** (`<script>`, `<script setup>`, `<template>`) via the Vue processor.
- **React / JSX / TSX** and plain JS/TS through the JS processor (`.js .mjs .cjs .jsx .ts .mts .cts .tsx`).
- PikaCSS compilation consumes authoritative physical source documents. Virtual/generated host modules are not part of the PikaCSS compilation source universe.

## Versioning

- All `@pikacss/*` packages are versioned in lockstep.
- After 1.0.0, the project follows semantic versioning.
- Main-entry public surfaces are guarded by `public-api` tests; additions/removals are deliberate review events.
- Depend on documented consumer-facing APIs rather than package-private Integration/compiler seams.
