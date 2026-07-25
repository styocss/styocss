# API Reference Overview

- Canonical docs path: `docs/api/index.md`
- Route group: `reference`
- Section: `API Reference`
- Category: `api`
- Page kind: `reference`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Document the structure of the API Reference and route readers to the right package page for exact lookup.

## Target reader

- Users or contributors who already know which package or symbol they need to look up.

## Prerequisites

- Route stage: The reader has left a guide or README page and now needs exact package lookup.
- Capability: The reader has basic familiarity with the PikaCSS package surface.

## Must include

- What the API Reference is and how it is generated or maintained.
- How the package-oriented structure of the reference is organized.
- When readers should stay in API lookup versus return to guide content.
- Why the route links to package pages are organized by package boundary.

## Mental model

- The API route is a lookup surface with one generated page per published package, while the overview page explains ownership, generation, and routing expectations.

## Example requirement

- No example required; package links are the primary content.

## Validation

- Readers should be able to tell which pages are hand-authored overview pages, which pages are generator-owned package references, and where to go when they need conceptual teaching instead.

## Common pitfalls

- Treating the overview like a guide page with long usage tutorials.
- Hiding generator ownership and JSDoc dependency from the reader.
- Letting package pages become a mix of generated and hand-patched prose.

## Required API links

- All generated package reference pages.
- The package-level exports that define the generator input boundary.

## Must not include

- Long conceptual tutorials.
- Full package usage examples that belong in guide or README surfaces.

## Link contract

- Incoming route-local: None.
- Incoming cross-route: Learn guide pages, Extend pages, package READMEs, and Contributing pages.
- Outgoing route-local: `core.md`, `integration.md`, `unplugin.md`, `nuxt.md`, `plugin-reset.md`, `plugin-icons.md`, `plugin-fonts.md`, `plugin-typography.md`, and `eslint-config.md`.
- Outgoing cross-route: None.

## Source of truth

- `scripts/gen-api-docs.ts`
- exported package entrypoints under `packages/*/src/index.ts`

## Notes

- Keep this page setting expectations for generated docs quality.