# Create a Plugin

- Canonical docs path: `docs/plugin-development/create-a-plugin.md`
- Route group: `extend`
- Section: `Plugin Development`
- Category: `plugin-dev`
- Page kind: `tutorial`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Teach how and when to build a PikaCSS plugin.

## Target reader

- Developers creating a new plugin or modifying an existing one.

## Prerequisites

- Route stage: The reader has completed the Plugin Development overview.
- Capability: The reader can work in the repository or in a plugin project with TypeScript.

## Must include

- What the minimal plugin shape looks like and where it lives.
- How the canonical helper or identity pattern is used for plugin definition.
- How readers should choose a minimal hook or capability for a first implementation.
- Why validation expectations matter for plugin work.

## Example requirement

- Include a minimal plugin example that is real enough to compile and can be extended in later pages.

## Must not include

- Exhaustive hook reference.
- Consumer installation guidance.
- Detailed config augmentation edge cases beyond a short pointer.

## Link contract

- Incoming route-local: `index.md`.
- Incoming cross-route: Contributing pages and the public Develop Plugin skill page for implementation contributors.
- Outgoing route-local: `hook-execution.md`, `config-augmentation.md`, and `official-plugin-references.md`.
- Outgoing cross-route: `../../reference/api/index.md` for exact exported types and `../../help/contributing/index.md` when repository workflow detail becomes the next task.

## Source of truth

- `packages/core`
- official plugin packages under `packages/plugin-*`
- scaffolding scripts under `scripts/`

## Notes

- Keep this page prioritizing a first working plugin over completeness.