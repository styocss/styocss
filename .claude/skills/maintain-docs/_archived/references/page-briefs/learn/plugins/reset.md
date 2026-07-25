# Reset Plugin

- Canonical docs path: `docs/guide/plugins/reset.md`
- Route group: `learn`
- Section: `Plugins Ecosystem`
- Category: `guide`
- Page kind: `tutorial`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Teach how and when to use the Reset plugin.

## Target reader

- Users who want baseline global styles and are evaluating whether the reset plugin is preferable to hand-written preflights.

## Prerequisites

- Route stage: The reader has reached the Plugins section and already understands preflights.
- Capability: The reader can compare a plugin-based baseline with core preflight behavior.

## Must include

- What the Reset plugin is for.
- When readers should prefer it over core preflights.
- How the required installation and setup steps fit together.
- Why the main global styling tradeoffs matter.

## Example requirement

- Include installation/config setup and one small output-oriented example.

## Must not include

- Plugin authoring details.
- Generic CSS reset history.

## Link contract

- Incoming route-local: `index.md`, `../core-features/preflights.md`, and `../configuration/index.md`.
- Incoming cross-route: None.
- Outgoing route-local: `../patterns/composition.md` and `index.md`.
- Outgoing cross-route: Troubleshooting pages when global styling conflicts persist.

## Source of truth

- `packages/plugin-reset`
- `packages/core`

## Notes

- Keep this page explicit about the overlap and boundary with core preflights.