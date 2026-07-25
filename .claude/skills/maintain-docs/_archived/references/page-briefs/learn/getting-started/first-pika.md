# First Pika

- Canonical docs path: `docs/getting-started/first-pika.md`
- Route group: `learn`
- Section: `Getting Started`
- Category: `getting-started`
- Page kind: `tutorial`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Teach how and when to use a minimal Pika example to verify that setup is working.

## Target reader

- Users who have installed PikaCSS and need a first successful result.

## Prerequisites

- Route stage: Installation is complete.
- Capability: The reader can run their project or a local example.

## Must include

- What the smallest meaningful style input looks like.
- How the engine output should be understood at a high level.
- How readers should verify that setup succeeded.
- Why configuration and core features are the next useful stops.

## Example requirement

- Include a `pikain` and `pikaout` example pair that demonstrates a successful render.

## Must not include

- Deep explanations of selector grammar or feature-specific edge cases.
- Framework-specific branching beyond what is necessary to keep the example runnable.

## Link contract

- Incoming route-local: `installation.md`, `../integrations/vite.md`, and `../integrations/nuxt.md`.
- Incoming cross-route: None.
- Outgoing route-local: `generated-files.md`, `../configuration/index.md`, and `../core-features/index.md`.
- Outgoing cross-route: Troubleshooting pages when the first render or generated output does not appear.

## Source of truth

- `packages/core`
- `demo/src/pika.gen.ts`
- `demo/src/pika.gen.css`
- `docs/.examples/`

## Notes

- Keep the earlier `Basic Usage` intent, but sharpen it around a single first-success outcome.