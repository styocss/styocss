# Installation

- Canonical docs path: `docs/getting-started/installation.md`
- Route group: `learn`
- Section: `Getting Started`
- Category: `getting-started`
- Page kind: `tutorial`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Teach how and when to install PikaCSS and choose the right setup path.

## Target reader

- Users ready to install PikaCSS in a new or existing project.

## Prerequisites

- Route stage: The reader has decided to try PikaCSS and needs the first concrete setup step.
- Capability: The reader knows which app stack they are using, or is ready to choose one.

## Must include

- What the minimum installation path looks like.
- How core-only setup differs from integration-assisted setup.
- How readers should choose between Vite, Nuxt, or direct engine usage.
- What success looks like before moving to `First Pika`.

## Example requirement

- Include package-manager install code groups and one minimal configuration snippet.

## Must not include

- Full framework walkthroughs.
- Full explanation of generated files or linting.
- Plugin-specific setup.

## Link contract

- Incoming route-local: `index.md`.
- Incoming cross-route: Home page and README install entry points.
- Outgoing route-local: `first-pika.md`, `../integrations/index.md`, and `../configuration/index.md`.
- Outgoing cross-route: Troubleshooting pages when installation or setup verification fails.

## Source of truth

- `package.json`
- `packages/core`
- `packages/integration`
- `packages/unplugin`
- `packages/nuxt`

## Notes

- Keep this page short and operational.