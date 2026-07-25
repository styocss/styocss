# Fonts Plugin

- Canonical docs path: `docs/guide/plugins/fonts.md`
- Route group: `learn`
- Section: `Plugins Ecosystem`
- Category: `guide`
- Page kind: `tutorial`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Teach how and when to use the Fonts plugin.

## Target reader

- Users who need font loading or font-related workflow support through PikaCSS.

## Prerequisites

- Route stage: The reader has reached the Plugins section and understands the plugin overview.
- Capability: The reader can evaluate whether font loading or font-related workflow belongs in the project.

## Must include

- What the Fonts plugin solves.
- How the required installation and setup steps fit together.
- How the plugin interacts with the rest of the style workflow.
- Why the main font ownership or configuration constraints matter.

## Example requirement

- Include install/config snippets and one usage example that demonstrates the practical outcome.

## Must not include

- Full typography system guidance that belongs elsewhere.
- Plugin implementation detail.

## Link contract

- Incoming route-local: `index.md`, `../configuration/index.md`, `../patterns/dark-mode.md`, and `../patterns/composition.md`.
- Incoming cross-route: None.
- Outgoing route-local: `typography.md` and `index.md`.
- Outgoing cross-route: Troubleshooting pages when asset loading or plugin configuration still fails.

## Source of truth

- `packages/plugin-fonts`
- font-related examples in `docs/.examples/`

## Notes

- Keep the operational setup clear before discussing stylistic possibilities.