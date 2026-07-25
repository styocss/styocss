# Responsive Design

- Canonical docs path: `docs/guide/patterns/responsive.md`
- Route group: `learn`
- Section: `Patterns`
- Category: `guide`
- Page kind: `tutorial`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Teach how and when to use responsive patterns in PikaCSS.

## Target reader

- Users building layouts or components that change across breakpoints or conditions.

## Prerequisites

- Route stage: The reader has entered the Patterns section.
- Capability: The reader understands selectors and variables well enough to express responsive changes cleanly.

## Must include

- What responsive behavior looks like in the PikaCSS mental model.
- How to structure responsive style input cleanly.
- When responsive logic should stay local versus shared.
- Why common responsive readability pitfalls matter.

## Example requirement

- Include a `pikain` and `pikaout` pair for a real responsive pattern.

## Must not include

- Generic CSS media query theory with no PikaCSS mapping.
- Dark-mode guidance.

## Link contract

- Incoming route-local: `index.md`, `../core-features/selectors.md`, and `../core-features/variables.md`.
- Incoming cross-route: None.
- Outgoing route-local: `composition.md` and `../plugins/index.md`.
- Outgoing cross-route: Troubleshooting pages when responsive output or breakpoint behavior still looks incorrect.

## Source of truth

- `packages/core`
- responsive examples in `docs/.examples/`

## Notes

- Keep the examples realistic.