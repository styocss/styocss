# Typography Plugin API

- Canonical docs path: `docs/api/plugin-typography.md`
- Route group: `reference`
- Section: `API Reference`
- Category: `api`
- Page kind: `reference`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Document the exported surface of `@pikacss/plugin-typography`.

## Target reader

- Consumers or contributors using the typography plugin package surface directly.

## Prerequisites

- Route stage: The reader has already entered plugin lookup from either Learn or Extend.
- Capability: The reader can use exact plugin exports.

## Must include

- What the current exported symbols from `@pikacss/plugin-typography` are.
- How source-aligned descriptions clarify those exports.
- When readers should return to the plugin guide or authoring docs for operational context.

## Example requirement

- No example required; generator-provided signatures and summaries are enough.

## Must not include

- Full prose styling tutorials.

## Link contract

- Incoming route-local: `index.md` and adjacent plugin package API pages when the reader remains in plugin reference lookup.
- Incoming cross-route: Typography plugin guide and Plugin Development reference pages.
- Outgoing route-local: `plugin-fonts.md`, `plugin-icons.md`, and `index.md`.
- Outgoing cross-route: Typography plugin guide and Plugin Development pages when exact symbols are not enough.

## Source of truth

- `packages/plugin-typography/src/index.ts`
- `packages/plugin-typography/src`
- generated API docs script

## Notes

- Keep package lookup clean and avoid duplicating guide content.