# Official Plugin References

- Canonical docs path: `docs/plugin-development/official-plugin-references.md`
- Route group: `extend`
- Section: `Plugin Development`
- Category: `plugin-dev`
- Page kind: `reference`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Explain how plugin authors should use the official plugins as implementation references.

## Target reader

- Plugin authors who need concrete examples after learning the plugin authoring model.

## Prerequisites

- Route stage: The reader has completed the earlier pages in the Plugin Development route.
- Capability: The reader is ready to study real implementations as authoring references.

## Must include

- Which official plugins are useful implementation references for which concerns.
- What readers should inspect in each official plugin.
- How readers should copy patterns responsibly.
- Why consumer plugin guides are not substitute implementation documentation.

## Example requirement

- No example required; curated reference mapping is the primary content.

## Must not include

- Consumer setup tutorials.
- Duplicated full source commentary for every official plugin.

## Link contract

- Incoming route-local: `create-a-plugin.md`, `hook-execution.md`, and `config-augmentation.md`.
- Incoming cross-route: None.
- Outgoing route-local: `index.md` when the reader needs to reorient within the Plugin Development route.
- Outgoing cross-route: Relevant API Reference pages, Contributing pages, and Learn plugin guides when consumer-facing context is the next question.

## Source of truth

- `packages/plugin-reset`
- `packages/plugin-icons`
- `packages/plugin-fonts`
- `packages/plugin-typography`

## Notes

- Keep this page helping authors navigate the repository efficiently.