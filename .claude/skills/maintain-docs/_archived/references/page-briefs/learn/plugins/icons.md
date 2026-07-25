# Icons Plugin

- Canonical docs path: `docs/guide/plugins/icons.md`
- Route group: `learn`
- Section: `Plugins Ecosystem`
- Category: `guide`
- Page kind: `tutorial`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Teach how and when to use the Icons plugin.

## Target reader

- Users who need icon workflows integrated into PikaCSS.

## Prerequisites

- Route stage: The reader has reached the Plugins section and understands the plugin overview.
- Capability: The reader can follow consumer plugin setup and evaluate whether icon workflows belong in the project.

## Must include

- What the Icons plugin adds.
- How the required installation and setup steps fit together.
- How readers should reference or consume icons in a normal workflow.
- Why the main icon-set or output constraints matter.

## Example requirement

- Include install/config snippets and one realistic usage example.

## Must not include

- Implementation internals of the plugin.
- Broad icon design advice unrelated to the plugin surface.

## Link contract

- Incoming route-local: `index.md` and `../configuration/index.md`.
- Incoming cross-route: None.
- Outgoing route-local: `fonts.md`, `typography.md`, and `index.md` when the reader is comparing adjacent plugin options.
- Outgoing cross-route: Troubleshooting pages when icon asset resolution or generated output fails.

## Source of truth

- `packages/plugin-icons`
- plugin usage examples in `docs/.examples/`

## Notes

- Keep this page focused on consumption.