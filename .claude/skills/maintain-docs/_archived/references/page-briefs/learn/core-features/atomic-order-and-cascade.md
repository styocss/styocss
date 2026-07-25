# Atomic Order and Cascade

- Canonical docs path: `docs/guide/core-features/atomic-order-and-cascade.md`
- Route group: `learn`
- Section: `Core Features`
- Category: `guide`
- Page kind: `tutorial`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Teach how and when to reason about atomic order and cascade behavior in PikaCSS.

## Target reader

- Users who understand basic PikaCSS usage but need the mental model that makes generated CSS predictable.

## Prerequisites

- Route stage: The reader has completed `First Pika` and read the Core Features overview.
- Capability: The reader is ready to reason about generated CSS.

## Must include

- What atomic order means in PikaCSS.
- How conflicting declarations should be reasoned about.
- Which authoring choices most strongly affect cascade outcomes.
- When readers should debug order issues versus restructure the source input.

## Example requirement

- Include a `pikain` and `pikaout` example pair showing a conflict or ordering-sensitive case.

## Must not include

- Exhaustive selector syntax details.
- Framework-specific debugging steps.

## Link contract

- Incoming route-local: `index.md`.
- Incoming cross-route: Troubleshooting pages about unexpected CSS output.
- Outgoing route-local: `selectors.md`, `shortcuts.md`, and `../patterns/composition.md`.
- Outgoing cross-route: Troubleshooting pages when ordering problems remain unresolved after the mental model is applied.

## Source of truth

- `packages/core/src`
- generated CSS examples in `docs/.examples/`

## Notes

- Keep this page explicit.