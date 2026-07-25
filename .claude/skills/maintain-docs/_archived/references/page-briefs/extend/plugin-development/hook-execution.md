# Hook Execution

- Canonical docs path: `docs/plugin-development/hook-execution.md`
- Route group: `extend`
- Section: `Plugin Development`
- Category: `plugin-dev`
- Page kind: `reference`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Explain the plugin lifecycle and hook execution model for authors who need phase-level precision.

## Target reader

- Plugin authors who already understand the minimal plugin shape and now need lifecycle precision.

## Prerequisites

- Route stage: The reader has completed `create-a-plugin.md` or equivalent implementation work.
- Capability: The reader can already reason about a minimal plugin and now needs lifecycle precision.

## Must include

- What the major plugin lifecycle stages are for authors.
- How hook placement affects output and behavior.
- What the most important ordering or interaction rules are.
- Why choosing the wrong hook causes common authoring mistakes.

## Example requirement

- Include a focused example that contrasts two hook placements or shows why timing matters.

## Must not include

- Generic consumer feature walkthroughs.
- Repetition of basic plugin scaffolding that belongs in `create-a-plugin.md`.

## Link contract

- Incoming route-local: `create-a-plugin.md`.
- Incoming cross-route: Troubleshooting pages for extension bugs.
- Outgoing route-local: `config-augmentation.md` and `official-plugin-references.md`.
- Outgoing cross-route: `../../reference/api/core.md` for exact hook-related symbols and Troubleshooting pages when lifecycle timing problems remain unresolved.

## Source of truth

- `packages/core/src`
- official plugin implementations under `packages/plugin-*`

## Notes

- Keep this page preserving ambiguity where the runtime behavior is intentionally nuanced.