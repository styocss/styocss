# Fonts Plugin API

- Canonical docs path: `docs/api/plugin-fonts.md`
- Route group: `reference`
- Section: `API Reference`
- Category: `api`
- Page kind: `reference`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Document the exported surface of `@pikacss/plugin-fonts`.

## Target reader

- Consumers or contributors using the fonts plugin package surface directly.

## Prerequisites

- Route stage: The reader has already entered plugin lookup from either Learn or Extend.
- Capability: The reader can use exact plugin exports.

## Must include

- What the current exported symbols from `@pikacss/plugin-fonts` are.
- How source-aligned descriptions clarify those exports.
- When readers should return to the plugin guide or authoring docs for usage context.

## Example requirement

- No example required; generator-provided signatures and summaries are enough.

## Must not include

- Full setup or typography guidance.

## Link contract

- Incoming route-local: `index.md` and adjacent plugin package API pages when lookup continues within official plugin packages.
- Incoming cross-route: Fonts plugin guide and Plugin Development reference pages.
- Outgoing route-local: `plugin-typography.md`, `plugin-icons.md`, and `index.md`.
- Outgoing cross-route: Fonts plugin guide and Plugin Development pages when operational or authoring context is needed.

## Source of truth

- `packages/plugin-fonts/src/index.ts`
- `packages/plugin-fonts/src`
- generated API docs script

## Notes

- Keep this page focused on the package surface.