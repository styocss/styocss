# Dark Mode

- Canonical docs path: `docs/guide/patterns/dark-mode.md`
- Route group: `learn`
- Section: `Patterns`
- Category: `guide`
- Page kind: `tutorial`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Teach how and when to use dark mode patterns in PikaCSS.

## Target reader

- Users building multi-theme or dark-mode-aware interfaces.

## Prerequisites

- Route stage: The reader has entered the Patterns section.
- Capability: The reader understands selectors and variables well enough to reason about theme switching.

## Must include

- What the recommended dark mode strategy or strategies are.
- How variables, selectors, and ordering interact in theme switching.
- Why common failure cases create unstable theme behavior.
- When readers should keep the pattern simple.

## Example requirement

- Include an example that shows both authored input and emitted output for a dark-mode pattern.

## Must not include

- Full design system theming philosophy detached from PikaCSS behavior.
- Responsive pattern detail unless it is necessary to explain an interaction.

## Link contract

- Incoming route-local: `index.md` and `../core-features/variables.md`.
- Incoming cross-route: Troubleshooting pages for conflicting theme output.
- Outgoing route-local: `composition.md` and `../plugins/index.md`.
- Outgoing cross-route: Troubleshooting pages when theme switching remains inconsistent after the documented pattern is applied.

## Source of truth

- `packages/core`
- theme-related examples in `docs/.examples/`

## Notes

- Keep this page preferring a stable recommended path over listing every theming variation.