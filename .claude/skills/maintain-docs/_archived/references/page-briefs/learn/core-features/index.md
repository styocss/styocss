# Core Features Overview

- Canonical docs path: `docs/guide/core-features/index.md`
- Route group: `learn`
- Section: `Core Features`
- Category: `guide`
- Page kind: `overview`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Orient readers to the core feature model and route them to the right next page for the concept they need next.

## Target reader

- Users who already have PikaCSS running and need the conceptual map for everyday authoring.

## Prerequisites

- Route stage: The reader has completed initial setup and a first successful run.
- Capability: The reader is ready to move from setup verification into everyday authoring concepts.

## Must include

- What the core feature family includes.
- How selectors, variables, shortcuts, keyframes, and preflights relate to authored input and generated output.
- Why `atomic-order-and-cascade.md` matters before deeper feature pages.

## Mental model

- Core Features are the named engine-level building blocks that shape generated output and authoring vocabulary across the whole project.

## Example requirement

- Include one compact multi-feature example that previews the feature family.

## Validation

- Readers should be able to map a config block or style concern to the correct feature page before they dive deeper.

## Common pitfalls

- Treating this page as a shallow glossary instead of a feature map.
- Jumping straight into plugin or pattern advice before the engine feature model is clear.
- Explaining every feature in full instead of routing into the leaf pages.

## Required API links

- `EngineConfig` and `defineEngineConfig` from the core package reference.
- The core package reference page as the exact API lookup surface for the named feature family.

## Must not include

- Full reference detail for each feature.
- Pattern-level advice that belongs in the Patterns section.

## Link contract

- Incoming route-local: `../configuration/index.md` and `../getting-started/first-pika.md`.
- Incoming cross-route: None.
- Outgoing route-local: `atomic-order-and-cascade.md`, `selectors.md`, `variables.md`, `shortcuts.md`, `keyframes.md`, and `preflights.md`.
- Outgoing cross-route: None.

## Source of truth

- `packages/core/src`
- `docs/.examples/`

## Notes

- Keep this page mapping the feature space.