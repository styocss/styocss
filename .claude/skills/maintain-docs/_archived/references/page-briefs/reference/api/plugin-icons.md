# Icons Plugin API

- Canonical docs path: `docs/api/plugin-icons.md`
- Route group: `reference`
- Section: `API Reference`
- Category: `api`
- Page kind: `reference`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Document the exported surface of `@pikacss/plugin-icons`.

## Target reader

- Consumers or contributors using the icons plugin package surface directly.

## Prerequisites

- Route stage: The reader has already entered plugin lookup from either Learn or Extend.
- Capability: The reader can use exact plugin exports.

## Must include

- What the current exported symbols from `@pikacss/plugin-icons` are.
- How source-aligned descriptions clarify those exports.
- When readers should return to the plugin guide or authoring docs for usage context.

## Example requirement

- No example required; generator-provided signatures and summaries are enough.

## Must not include

- Full installation or usage tutorials.

## Link contract

- Incoming route-local: `index.md` and adjacent plugin package API pages when lookup stays within official plugin packages.
- Incoming cross-route: Icons plugin guide and Plugin Development reference pages.
- Outgoing route-local: `plugin-fonts.md`, `plugin-typography.md`, and `index.md`.
- Outgoing cross-route: Icons plugin guide and Plugin Development pages when contextual usage or authoring detail is needed.

## Source of truth

- `packages/plugin-icons/src/index.ts`
- `packages/plugin-icons/src`
- generated API docs script

## Notes

- Keep source ownership explicit.