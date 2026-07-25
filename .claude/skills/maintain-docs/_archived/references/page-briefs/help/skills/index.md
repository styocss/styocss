# Skills Overview

- Canonical docs path: `docs/skills/index.md`
- Route group: `help`
- Section: `Skills`
- Category: `skills`
- Page kind: `resource`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Help readers understand when and how to use the public PikaCSS skills.

## Target reader

- Users who want guided help for common PikaCSS tasks beyond static docs reading.

## Prerequisites

- Route stage: The reader has reached a support or task-routing decision point.
- Capability: The reader can identify whether the task is about using PikaCSS or authoring a plugin.

## Must include

- What a public skill is in the context of the PikaCSS docs.
- How public skills differ from internal repository-only skills.
- What the available user-facing skills are.
- When a skill is the better path.

## Mental model

- Skills are guided task routes for readers who already know their job-to-be-done and want faster routing than static docs navigation.

## Example requirement

- No example required; brief usage scenarios are more useful.

## Validation

- Readers should be able to decide whether they need the consumer-facing skill or the plugin-authoring skill without being exposed to internal maintenance workflows.

## Common pitfalls

- Listing internal repository-only skills alongside public user-facing skills.
- Presenting Skills as a general Copilot customization tutorial.
- Turning the page into a maintenance workflow catalog instead of a reader support surface.

## Required API links

- No direct API links are required on the overview page unless a specific public skill needs exact package reference support.

## Must not include

- Internal customization details for non-public skills.
- General Copilot customization tutorials unrelated to PikaCSS tasks.

## Link contract

- Incoming route-local: `../contributing/index.md`.
- Incoming cross-route: Learn pages, including `../learn/getting-started/eslint.md`, Home page resource links, and other routes that recommend guided task support.
- Outgoing route-local: `use-pikacss.md` and `develop-plugin.md`.
- Outgoing cross-route: None.

## Source of truth

- public docs skill definitions and packaged skill artifacts under `docs/public/skills/`
- repository routing guidance in `AGENTS.md`

## Notes

- Keep this page presenting skills as task accelerators.