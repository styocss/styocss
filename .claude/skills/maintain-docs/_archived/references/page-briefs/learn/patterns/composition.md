# Composition

- Canonical docs path: `docs/guide/patterns/composition.md`
- Route group: `learn`
- Section: `Patterns`
- Category: `guide`
- Page kind: `tutorial`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Teach how and when to use composition patterns in PikaCSS.

## Target reader

- Users who are moving from small examples to real component or app-level authoring.

## Prerequisites

- Route stage: The reader has already worked through the earlier Patterns and Core Features material.
- Capability: The reader understands selectors, variables, shortcuts, and ordering well enough to compose larger structures.

## Must include

- What composition means in a PikaCSS context.
- How readers should choose between inline input, shortcuts, and broader shared structures.
- When readers should simplify.
- Why plugin authoring may become the better boundary beyond this page.

## Example requirement

- Include an example that combines multiple core features into a maintainable pattern and shows output.

## Must not include

- Plugin lifecycle or extension API detail.
- Framework component architecture advice that is not specific to PikaCSS.

## Link contract

- Incoming route-local: `index.md`, `responsive.md`, `dark-mode.md`, and `../core-features/shortcuts.md`.
- Incoming cross-route: None.
- Outgoing route-local: `../plugins/index.md` and `../core-features/preflights.md`.
- Outgoing cross-route: `../../extend/plugin-development/index.md` when composition pressure becomes plugin authoring pressure.

## Source of truth

- `packages/core`
- composition examples in `docs/.examples/`

## Notes

- Keep this page as the capstone of the Learn route.