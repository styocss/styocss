# Use PikaCSS skill

- Canonical docs path: `docs/skills/use-pikacss.md`
- Route group: `help`
- Section: `Skills`
- Category: `skills`
- Page kind: `resource`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Help readers understand when and how to use the Use PikaCSS skill.

## Target reader

- Users who need guided help with setup, configuration, plugin consumption, or end-user usage patterns.

## Prerequisites

- Route stage: The reader has identified a consumer-side task and is considering guided help.
- Capability: The reader can distinguish consumer usage work from plugin authoring or repository maintenance.

## Must include

- What the scope of the skill is.
- What kinds of user requests it is best suited for.
- How this skill differs from plugin authoring or broader repository contribution work.
- When this skill complements the Learn route better than static docs alone.

## Example requirement

- No example required; representative tasks are more useful than code examples.

## Must not include

- Plugin authoring workflow detail.
- Internal skill implementation detail.

## Link contract

- Incoming route-local: `index.md`.
- Incoming cross-route: Learn route pages and Troubleshooting pages that recommend a guided consumer workflow.
- Outgoing route-local: `index.md` when the reader needs to choose a different skill resource.
- Outgoing cross-route: Relevant Learn pages and plugin consumer guides when the reader needs deeper static documentation.

## Source of truth

- public packaged skill artifacts
- route boundaries in `AGENTS.md`

## Notes

- Keep this page discoverable without sounding mandatory.