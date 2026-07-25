# Nuxt Integration

- Canonical docs path: `docs/guide/integrations/nuxt.md`
- Route group: `learn`
- Section: `Framework Integrations`
- Category: `guide`
- Page kind: `tutorial`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Teach how and when to use the Nuxt integration path for PikaCSS.

## Target reader

- Users integrating PikaCSS into a Nuxt app.

## Prerequisites

- Route stage: Installation is complete and the reader has chosen the Nuxt path.
- Capability: The reader is using Nuxt.

## Must include

- What packages are required for the Nuxt path.
- How the required Nuxt module or integration steps fit together.
- What Nuxt-specific configuration expectations readers should understand.
- How readers should confirm that the integration is working.

## Mental model

- The Nuxt module is a framework-owned wrapper around the same build-time integration flow, but with Nuxt-specific registration and defaults.

## Example requirement

- Include a real Nuxt config example and one minimal usage example.

## Validation

- Readers should be able to confirm that the Nuxt module is registered, generated CSS reaches the app, and the expected PikaCSS options live under the `pikacss` key.

## Common pitfalls

- Repeating Vite setup details that Nuxt already abstracts away.
- Omitting how readers verify that the module path is actually active.
- Failing to connect Nuxt config shape back to the shared PikaCSS config model.

## Required API links

- `ModuleOptions` from the Nuxt package reference.
- The unplugin package reference when the page mentions the wrapped option surface.

## Must not include

- Vite-specific details that do not apply to Nuxt.
- Plugin authoring internals.

## Link contract

- Incoming route-local: `index.md` and `../getting-started/installation.md`.
- Incoming cross-route: None.
- Outgoing route-local: `../getting-started/first-pika.md`, `../configuration/index.md`, and `../core-features/index.md`.
- Outgoing cross-route: Troubleshooting pages when module setup or generated output verification fails.

## Source of truth

- `packages/nuxt`
- `packages/unplugin`

## Notes

- Keep this page aligned with the Nuxt package surface.