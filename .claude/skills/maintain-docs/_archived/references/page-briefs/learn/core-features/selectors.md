# Selectors

- Canonical docs path: `docs/guide/core-features/selectors.md`
- Route group: `learn`
- Section: `Core Features`
- Category: `guide`
- Page kind: `tutorial`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Teach how and when to use selectors in PikaCSS.

## Target reader

- Users ready to write or refine selectors in real PikaCSS code.

## Prerequisites

- Route stage: The reader has entered the Core Features section and has seen the ordering model.
- Capability: The reader is ready to target real elements and states.

## Must include

- What selector authoring looks like in PikaCSS.
- How common selector categories behave in real authoring.
- Why selector choices affect readability and output.
- When common selector pitfalls tend to surprise new users.

## Example requirement

- Include `pikain` and `pikaout` examples showing at least one nested or stateful selector case.

## Must not include

- Variable or shortcut guidance unless directly needed for the example.
- Broad pattern recommendations that belong in `composition.md`.

## Link contract

- Incoming route-local: `index.md` and `atomic-order-and-cascade.md`.
- Incoming cross-route: None.
- Outgoing route-local: `variables.md`, `shortcuts.md`, and `../patterns/composition.md`.
- Outgoing cross-route: None.

## Source of truth

- `packages/core/src`
- selector-focused examples in `docs/.examples/`

## Notes

- Keep this page grounded in PikaCSS authoring behavior.