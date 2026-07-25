# Variables

- Canonical docs path: `docs/guide/core-features/variables.md`
- Route group: `learn`
- Section: `Core Features`
- Category: `guide`
- Page kind: `tutorial`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Teach how and when to use variables in PikaCSS.

## Target reader

- Users who need reusable values in style input.

## Prerequisites

- Route stage: The reader has completed a first working example and entered the Core Features section.
- Capability: The reader is ready to replace repeated literals with reusable values.

## Must include

- What variables are for in PikaCSS.
- How variables improve maintainability and scaling.
- When variables are more appropriate than one-off values.
- Why any important limits or expectations matter in real authoring.

## Example requirement

- Include an example showing a repeated value before and after moving to variables.

## Must not include

- General design token theory divorced from PikaCSS behavior.
- Plugin-specific typography or font configuration.

## Link contract

- Incoming route-local: `index.md`, `selectors.md`, and `../configuration/index.md`.
- Incoming cross-route: None.
- Outgoing route-local: `shortcuts.md`, `../patterns/composition.md`, and `../plugins/index.md`.
- Outgoing cross-route: None.

## Source of truth

- `packages/core/src`
- variable examples in `docs/.examples/`

## Notes

- Keep this page focused on practical authoring decisions.