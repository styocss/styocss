# Framework Integrations Overview

- Canonical docs path: `docs/guide/integrations/index.md`
- Route group: `learn`
- Section: `Framework Integrations`
- Category: `guide`
- Page kind: `overview`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Orient readers to the framework integration options and route them to the right next page for their stack.

## Target reader

- Users who know they want to use PikaCSS in a specific app framework.

## Prerequisites

- Route stage: The reader has completed the initial installation decision.
- Capability: The reader knows which framework or toolchain they are using, or is ready to choose one.

## Must include

- What the integration packages do.
- How readers should choose between Vite, Nuxt, or direct engine usage.
- Why one integration path may be less surprising than another for a given stack.

## Example requirement

- No example required; a comparison table or short config sketch is enough.

## Must not include

- Full integration instructions for every framework on one page.
- Deep feature explanations that belong in Core Features.

## Link contract

- Incoming route-local: `../getting-started/installation.md` and `../getting-started/eslint.md`.
- Incoming cross-route: None.
- Outgoing route-local: `vite.md`, `nuxt.md`, and `../configuration/index.md`.
- Outgoing cross-route: Troubleshooting pages when framework setup fails before the first successful render.

## Source of truth

- `packages/integration`
- `packages/unplugin`
- `packages/nuxt`

## Notes

- Keep this page as a routing surface first.