# Shortcuts

- Canonical docs path: `docs/guide/core-features/shortcuts.md`
- Route group: `learn`
- Section: `Core Features`
- Category: `guide`
- Page kind: `tutorial`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Teach how and when to use shortcuts in PikaCSS.

## Target reader

- Users who have repeated style structures and want a higher-level authoring primitive.

## Prerequisites

- Route stage: The reader has already encountered selectors and variables in the Core Features route.
- Capability: The reader can recognize repeated style structures that may deserve abstraction.

## Must include

- What a shortcut is in PikaCSS.
- How shortcuts improve readability or reuse.
- When direct inline authoring is still the better choice.
- Why the boundary between consumer shortcuts and plugin authoring matters.

## Example requirement

- Include an example showing repeated style input refactored into a shortcut.

## Must not include

- Full plugin authoring guidance.
- Pattern-level app architecture advice that belongs in `composition.md`.

## Link contract

- Incoming route-local: `index.md`, `variables.md`, and `atomic-order-and-cascade.md`.
- Incoming cross-route: None.
- Outgoing route-local: `../patterns/composition.md` and `../plugins/index.md`.
- Outgoing cross-route: `../../extend/plugin-development/index.md` when the reader is crossing from consumer shortcuts into plugin authoring.

## Source of truth

- `packages/core/src`
- shortcut examples in `docs/.examples/`

## Notes

- Keep this page stopping before extension APIs.