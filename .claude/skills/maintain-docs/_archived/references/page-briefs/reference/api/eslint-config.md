# ESLint Config API

- Canonical docs path: `docs/api/eslint-config.md`
- Route group: `reference`
- Section: `API Reference`
- Category: `api`
- Page kind: `reference`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Document the exported surface of `@pikacss/eslint-config`.

## Target reader

- Users or contributors working directly with the ESLint config package.

## Prerequisites

- Route stage: The reader has already visited the ESLint setup guide or chosen package-level lookup.
- Capability: The reader can use exact package-level reference.

## Must include

- What the current exported symbols or config entry points from `@pikacss/eslint-config` are.
- How source-aligned descriptions clarify those exports.
- When readers should return to the ESLint guide for setup context.

## Example requirement

- No example required; generator-provided signatures and summaries are enough.

## Must not include

- Full linting tutorials or general ESLint education.

## Link contract

- Incoming route-local: `index.md` and `core.md` when the reader is moving between foundational package references.
- Incoming cross-route: ESLint setup guide and Contributing pages.
- Outgoing route-local: `core.md` and `index.md`.
- Outgoing cross-route: ESLint setup guide when operational context is required.

## Source of truth

- `packages/eslint-config/src/index.ts`
- `packages/eslint-config/src`
- generated API docs script

## Notes

- Keep this page following the same reference contract as the other package API pages.