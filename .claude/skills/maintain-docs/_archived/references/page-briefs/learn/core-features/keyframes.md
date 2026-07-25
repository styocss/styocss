# Keyframes

- Canonical docs path: `docs/guide/core-features/keyframes.md`
- Route group: `learn`
- Section: `Core Features`
- Category: `guide`
- Page kind: `tutorial`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Teach how and when to use keyframes in PikaCSS.

## Target reader

- Users who need reusable animation definitions in a PikaCSS workflow.

## Prerequisites

- Route stage: The reader has entered the Core Features section.
- Capability: The reader is ready to connect motion definitions to authored styles.

## Must include

- What keyframe support does in PikaCSS.
- How keyframe definitions connect to authored styles.
- What naming or reuse expectations readers should understand.
- Why common mistakes produce confusing animation output.

## Example requirement

- Include an example with keyframe input and emitted CSS output.

## Must not include

- Generic CSS animation tutorials with no PikaCSS angle.
- Motion design guidance unrelated to the engine behavior.

## Link contract

- Incoming route-local: `index.md` and `../patterns/composition.md` when motion becomes part of a broader Learn pattern.
- Incoming cross-route: None.
- Outgoing route-local: `preflights.md`, `../patterns/composition.md`, and `../plugins/index.md`.
- Outgoing cross-route: None.

## Source of truth

- `packages/core/src`
- animation examples in `docs/.examples/`

## Notes

- Keep the focus on how PikaCSS expresses keyframes.