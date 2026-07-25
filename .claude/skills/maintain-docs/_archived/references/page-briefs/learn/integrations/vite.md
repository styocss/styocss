# Vite Integration

- Canonical docs path: `docs/guide/integrations/vite.md`
- Route group: `learn`
- Section: `Framework Integrations`
- Category: `guide`
- Page kind: `tutorial`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Teach how and when to use the Vite integration path for PikaCSS.

## Target reader

- Users integrating PikaCSS into a Vite app.

## Prerequisites

- Route stage: Installation is complete and the reader has chosen the Vite path.
- Capability: The reader is using Vite or a Vite-based stack.

## Must include

- What packages are required for the Vite path.
- How the required Vite integration steps fit together.
- How PikaCSS participates in the Vite development flow.
- What output or generated artifacts readers should expect after setup.

## Mental model

- The Vite entry is the default application-facing wrapper around the lower-level integration runtime, generated files, and source scanning flow.

## Example requirement

- Include a real Vite configuration example and one runnable PikaCSS usage example.

## Validation

- Readers should be able to confirm that Vite resolves `pika.css`, generates the expected files, and reacts to static style changes during normal development.

## Common pitfalls

- Showing only plugin registration without a runnable usage or import outcome.
- Treating Vite as if it were the same as Nuxt module setup.
- Failing to explain generated file expectations after the plugin is added.

## Required API links

- `PluginOptions` and bundler entry expectations from the unplugin package reference.
- The Integration package reference when readers need the lower-level build-time layer.

## Must not include

- Nuxt-specific behavior.
- Deep plugin authoring or API reference detail.

## Link contract

- Incoming route-local: `index.md` and `../getting-started/installation.md`.
- Incoming cross-route: None.
- Outgoing route-local: `../getting-started/first-pika.md`, `../configuration/index.md`, and `../core-features/index.md`.
- Outgoing cross-route: Troubleshooting pages when integration output, file generation, or watch behavior fails.

## Source of truth

- `packages/integration`
- `packages/unplugin`
- `demo/vite.config.ts`
- `demo/pika.config.js`

## Notes

- Keep the setup concrete and avoid hiding required files behind prose-only explanation.