# Reset Plugin API

- Canonical docs path: `docs/api/plugin-reset.md`
- Route group: `reference`
- Section: `API Reference`
- Category: `api`
- Page kind: `reference`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Document the exported surface of `@pikacss/plugin-reset`.

## Target reader

- Consumers or contributors working directly with the reset plugin package surface.

## Prerequisites

- Route stage: The reader has already entered plugin lookup from either Learn or Extend.
- Capability: The reader can use exact plugin exports.

## Must include

- What the current exported symbols from `@pikacss/plugin-reset` are.
- How source-aligned descriptions clarify those exports.
- When readers should return to consumer or authoring docs because exact signatures are not enough.

## Example requirement

- No example required; generator-provided signatures and summaries are enough.

## Must not include

- Full usage tutorials.

## Link contract

- Incoming route-local: `index.md` and adjacent plugin package API pages when plugin lookup continues inside Reference.
- Incoming cross-route: Reset plugin guide and Plugin Development reference pages.
- Outgoing route-local: `plugin-icons.md`, `plugin-fonts.md`, and `index.md`.
- Outgoing cross-route: Reset plugin guide and Plugin Development pages when operational or authoring context is needed.

## Source of truth

- `packages/plugin-reset/src/index.ts`
- `packages/plugin-reset/src`
- generated API docs script

## Notes

- Keep this page as package reference.