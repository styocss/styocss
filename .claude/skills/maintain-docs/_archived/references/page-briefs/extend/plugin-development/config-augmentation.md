# Config Augmentation

- Canonical docs path: `docs/plugin-development/config-augmentation.md`
- Route group: `extend`
- Section: `Plugin Development`
- Category: `plugin-dev`
- Page kind: `reference`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Explain how plugins extend configuration safely and how plugin-owned options should stay separate from the shared configuration surface.

## Target reader

- Plugin authors exposing configuration options to consumers.

## Prerequisites

- Route stage: The reader has already learned the minimal plugin shape.
- Capability: The reader has a concrete need to add plugin-owned configuration.

## Must include

- What boundary separates shared engine config from plugin-owned config.
- How module augmentation or equivalent typing patterns fit into plugin config.
- What naming, ownership, and discoverability expectations apply to plugin options.
- When a plugin should avoid adding configuration altogether.

## Example requirement

- Include one focused typed configuration example.

## Must not include

- Full consumer configuration docs for official plugins.
- Broad TypeScript education unrelated to plugin config ownership.

## Link contract

- Incoming route-local: `create-a-plugin.md` and `hook-execution.md`.
- Incoming cross-route: Learn configuration hub pages that point plugin authors here.
- Outgoing route-local: `official-plugin-references.md`.
- Outgoing cross-route: API Reference pages when the reader needs exact exported config types or augmentation surfaces.

## Source of truth

- `packages/core`
- official plugin package source files and type surfaces

## Notes

- Keep this page reinforcing plugin-owned config boundaries.