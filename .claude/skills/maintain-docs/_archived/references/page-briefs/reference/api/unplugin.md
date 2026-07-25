# Unplugin API

- Canonical docs path: `docs/api/unplugin.md`
- Route group: `reference`
- Section: `API Reference`
- Category: `api`
- Page kind: `reference`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Document the exported surface of `@pikacss/unplugin`.

## Target reader

- Contributors and advanced integrators who need exact `@pikacss/unplugin` API lookup.

## Prerequisites

- Route stage: The reader has already entered the integration lookup flow.
- Capability: The reader understands the unplugin package boundary well enough to use exact API lookup.

## Must include

- What the current exported symbols from `@pikacss/unplugin` are.
- How source-aligned descriptions clarify those exports.
- When readers should return to integration docs for conceptual setup.

## Example requirement

- No example required; generator-provided signatures and summaries are enough.

## Must not include

- Generic Vite or Nuxt setup prose.

## Link contract

- Incoming route-local: `index.md`, `integration.md`, and `nuxt.md` when lookup stays within integration packages.
- Incoming cross-route: Vite integration guide and Contributing pages.
- Outgoing route-local: `integration.md`, `nuxt.md`, and `index.md`.
- Outgoing cross-route: Integration guide pages when route context is needed.

## Source of truth

- `packages/unplugin/src/index.ts`
- `packages/unplugin/src`
- generated API docs script

## Notes

- Keep this page distinct from both consumer integration docs and Nuxt module docs.