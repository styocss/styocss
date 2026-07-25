# Nuxt API

- Canonical docs path: `docs/api/nuxt.md`
- Route group: `reference`
- Section: `API Reference`
- Category: `api`
- Page kind: `reference`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Document the exported surface of `@pikacss/nuxt`.

## Target reader

- Nuxt users or contributors who already know they need symbol-level reference.

## Prerequisites

- Route stage: The reader has already visited the Nuxt guide or chosen Nuxt-specific API lookup.
- Capability: The reader can use exact Nuxt module exports.

## Must include

- What the current exported symbols from `@pikacss/nuxt` are.
- How source-aligned descriptions clarify those exports.
- When readers should return to the Nuxt guide for setup context.

## Example requirement

- No example required; generator-provided signatures and summaries are enough.

## Must not include

- Full Nuxt setup instructions.

## Link contract

- Incoming route-local: `index.md`, `integration.md`, and `unplugin.md` when the reader is comparing integration package surfaces.
- Incoming cross-route: Nuxt integration guide.
- Outgoing route-local: `unplugin.md`, `integration.md`, and `index.md`.
- Outgoing cross-route: Nuxt guide pages when contextual usage is required.

## Source of truth

- `packages/nuxt/src/index.ts`
- `packages/nuxt/src`
- generated API docs script

## Notes

- Keep this page narrow and package-specific.