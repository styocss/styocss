# Develop Plugin skill

- Canonical docs path: `docs/skills/develop-plugin.md`
- Route group: `help`
- Section: `Skills`
- Category: `skills`
- Page kind: `resource`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Help readers understand when and how to use the Develop Plugin skill.

## Target reader

- Users who need guided help with plugin implementation, lifecycle hooks, config augmentation, or plugin tests.

## Prerequisites

- Route stage: The reader has crossed from plugin consumption into plugin authoring and is considering guided help.
- Capability: The reader can distinguish plugin implementation work from consumer usage work.

## Must include

- What the scope of the skill is.
- What kinds of authoring tasks it supports.
- How this skill differs from the consumer-facing `use-pikacss` skill.
- When this skill complements the Plugin Development route better than static docs alone.

## Example requirement

- No example required; representative authoring tasks are more useful than code examples.

## Must not include

- Consumer installation guidance.
- Internal-only project maintenance detail.

## Link contract

- Incoming route-local: `index.md`.
- Incoming cross-route: Plugin Development overview and Contributing pages.
- Outgoing route-local: `index.md` when the reader needs to compare public skills.
- Outgoing cross-route: Plugin Development route pages and relevant API Reference pages.

## Source of truth

- public packaged skill artifacts
- route boundaries in `AGENTS.md`

## Notes

- Keep the authoring boundary explicit.