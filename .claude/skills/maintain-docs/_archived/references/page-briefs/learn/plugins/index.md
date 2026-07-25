# Plugins Overview

- Canonical docs path: `docs/guide/plugins/index.md`
- Route group: `learn`
- Section: `Plugins Ecosystem`
- Category: `guide`
- Page kind: `overview`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Orient readers to the plugins ecosystem and route them to the right next page for the plugin they need.

## Target reader

- Users who understand the core product and want to extend usage through plugins.

## Prerequisites

- Route stage: The reader has completed the main Learn path through Patterns or has reached a clear plugin decision point.
- Capability: The reader can distinguish between staying in core features and extending usage through plugins.

## Must include

- What problems plugins solve for consumers.
- How plugin usage differs from plugin authoring.
- How the official plugins differ from each other at a high level.
- When readers should stay in core features.

## Mental model

- Plugins extend the same engine model consumers already know, but they package repeated behavior or external capabilities so readers do not have to build those features manually.

## Example requirement

- Include a comparison-style example or decision matrix, not a long implementation walkthrough.

## Validation

- Readers should be able to choose the right official plugin or conclude that core features are enough.

## Common pitfalls

- Letting plugin authoring concepts leak into a consumer-facing selection page.
- Turning the overview into four miniature reference pages.
- Failing to say when a reader should stay in core features instead of adding a plugin.

## Required API links

- Package reference pages for each official plugin.
- The Plugin Development overview only as an explicit authoring boundary, not as a default progression path.

## Must not include

- Plugin authoring APIs.
- Full per-plugin configuration detail for every plugin on one page.

## Link contract

- Incoming route-local: `../patterns/index.md`, `../patterns/composition.md`, and `../configuration/index.md`.
- Incoming cross-route: None.
- Outgoing route-local: `reset.md`, `icons.md`, `fonts.md`, and `typography.md`.
- Outgoing cross-route: `../../extend/plugin-development/index.md` when the reader needs to author a plugin.

## Source of truth

- `packages/plugin-reset`
- `packages/plugin-icons`
- `packages/plugin-fonts`
- `packages/plugin-typography`

## Notes

- Keep this page as the target of the top-level Plugins nav item.