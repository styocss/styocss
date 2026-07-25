# Plugin Development Overview

- Canonical docs path: `docs/plugin-development/index.md`
- Route group: `extend`
- Section: `Plugin Development`
- Category: `plugin-dev`
- Page kind: `overview`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Orient readers to the Plugin Development route and route them to the right next page for their authoring task.

## Target reader

- Users who want to author or modify a PikaCSS plugin.
- Contributors who need a conceptual map before touching plugin internals.

## Prerequisites

- Route stage: The reader has crossed from consumer plugin usage into plugin authoring.
- Capability: The reader understands the Learn route and is comfortable reading TypeScript and package-level configuration.

## Must include

- What boundary separates plugin usage from plugin authoring.
- How the Plugin Development route is structured.
- What role engine hooks, config augmentation, and official plugin references play in that route.
- Why plugin authoring is not required for normal product usage.

## Example requirement

- No example required; a compact plugin shape preview is enough for an overview page.

## Must not include

- Consumer plugin installation walkthroughs.
- Detailed hook semantics that belong in `hook-execution.md`.

## Link contract

- Incoming route-local: None.
- Incoming cross-route: Learn plugin overview, Contributing pages, packaged skill pages for plugin authors, and package README entry points.
- Outgoing route-local: `create-a-plugin.md`, `hook-execution.md`, `config-augmentation.md`, and `official-plugin-references.md`.
- Outgoing cross-route: `../../reference/api/index.md` for exact exported surfaces and `../../help/contributing/index.md` for repository workflow expectations.

## Source of truth

- `packages/core`
- official plugin packages under `packages/plugin-*`

## Notes

- Keep this page as a clean starting point.