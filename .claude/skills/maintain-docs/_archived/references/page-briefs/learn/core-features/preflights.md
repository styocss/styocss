# Preflights

- Canonical docs path: `docs/guide/core-features/preflights.md`
- Route group: `learn`
- Section: `Core Features`
- Category: `guide`
- Page kind: `tutorial`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Teach how and when to use preflights in PikaCSS.

## Target reader

- Users who need global baseline styling or reset-like behavior.

## Prerequisites

- Route stage: The reader has already encountered the ordering and cascade model.
- Capability: The reader can distinguish global baseline styling from local authored styles.

## Must include

- What preflights are responsible for.
- How preflights interact with cascade expectations.
- When preflights are appropriate versus local selectors or plugins.
- Why overusing global behavior creates problems.

## Example requirement

- Include an example showing a small preflight definition and the resulting global CSS.

## Must not include

- Full reset plugin documentation.
- Plugin implementation details.

## Link contract

- Incoming route-local: `index.md`, `atomic-order-and-cascade.md`, and `../plugins/reset.md`.
- Incoming cross-route: None.
- Outgoing route-local: `../plugins/reset.md` and `../patterns/composition.md`.
- Outgoing cross-route: Troubleshooting pages when global overrides or baseline styling still behave unexpectedly.

## Source of truth

- `packages/core/src`
- preflight examples in `docs/.examples/`

## Notes

- Keep this page clarifying the boundary between core preflights and dedicated reset plugins.