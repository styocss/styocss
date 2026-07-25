# Integration API

- Canonical docs path: `docs/api/integration.md`
- Route group: `reference`
- Section: `API Reference`
- Category: `api`
- Page kind: `reference`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Document the exported surface of `@pikacss/integration`.

## Target reader

- Users and contributors who need exact exported symbols from the integration package.

## Prerequisites

- Route stage: The reader has already visited an integration guide or knows they need integration package lookup.
- Capability: The reader is familiar enough with the integration surface to read exact exports.

## Must include

- What the current exported symbols from `@pikacss/integration` are.
- How source-aligned descriptions clarify those exports.
- When readers should return to integration guides.

## Example requirement

- No example required; generator-provided signatures and summaries are enough.

## Must not include

- Full integration setup walkthroughs.

## Link contract

- Incoming route-local: `index.md`, `unplugin.md`, and `nuxt.md` when the reader is moving among integration-related package pages.
- Incoming cross-route: Integration guide pages and Contributing pages.
- Outgoing route-local: `unplugin.md`, `nuxt.md`, and `index.md`.
- Outgoing cross-route: Relevant integration guide pages when exact API lookup is insufficient.

## Source of truth

- `packages/integration/src/index.ts`
- `packages/integration/src`
- generated API docs script

## Notes

- Keep this page package-scoped and avoid absorbing unplugin or Nuxt docs.