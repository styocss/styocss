# Core API

- Canonical docs path: `docs/api/core.md`
- Route group: `reference`
- Section: `API Reference`
- Category: `api`
- Page kind: `reference`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Document the exported surface of `@pikacss/core`.

## Target reader

- Users and contributors working directly with the core package APIs.

## Prerequisites

- Route stage: The reader has chosen API lookup over guide-style explanation.
- Capability: The reader can recognize when exact signatures, option names, or symbol-level lookup are needed.

## Must include

- What the current exported symbols from `@pikacss/core` are.
- How available JSDoc-derived descriptions clarify those exports.
- When readers should leave the API page for guide or authoring context.

## Example requirement

- No example required; generator-provided signatures and summaries are enough.

## Must not include

- Narrative tutorials.
- Package setup walkthroughs.

## Link contract

- Incoming route-local: `index.md` and neighboring package API pages when lookup continues inside the Reference route.
- Incoming cross-route: Learn pages about core features and Plugin Development pages.
- Outgoing route-local: `integration.md`, `plugin-reset.md`, and `index.md` when package lookup continues.
- Outgoing cross-route: Learn core-feature pages and Plugin Development pages when conceptual context is needed.

## Source of truth

- `packages/core/src/index.ts`
- `packages/core/src`
- generated API docs script

## Notes

- Keep this page as the template for other package API pages.