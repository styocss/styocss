# Generated Files

- Canonical docs path: `docs/getting-started/generated-files.md`
- Route group: `learn`
- Section: `Getting Started`
- Category: `getting-started`
- Page kind: `reference`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Explain the generated artifacts that appear after setup and route readers to the right next page when they need workflow context.

## Target reader

- Users who have already run PikaCSS and want to understand the files it produces.

## Prerequisites

- Route stage: The reader has completed `First Pika`.
- Capability: The reader has seen generated artifacts in a project or example.

## Must include

- What files are generated.
- How readers should distinguish editable input from generated output.
- How generated files participate in the normal development workflow.
- Why generated artifacts change debugging and version-control expectations.

## Example requirement

- Include one generated-file pair using real generated output and annotate ownership clearly.

## Must not include

- Deep plugin configuration.
- Low-level runtime internals that do not affect user workflow.

## Link contract

- Incoming route-local: `first-pika.md`.
- Incoming cross-route: Troubleshooting pages about missing, stale, or confusing generated output.
- Outgoing route-local: `eslint.md` and `../configuration/index.md`.
- Outgoing cross-route: Troubleshooting pages when generated artifacts remain incorrect after the page guidance is applied.

## Source of truth

- `demo/src/pika.gen.css`
- `demo/src/pika.gen.ts`
- generated-file behavior in integration packages

## Notes

- Keep this page reinforcing that generated outputs are not hand-maintained.