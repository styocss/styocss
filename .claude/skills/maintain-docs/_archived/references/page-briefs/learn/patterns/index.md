# Patterns Overview

- Canonical docs path: `docs/guide/patterns/index.md`
- Route group: `learn`
- Section: `Patterns`
- Category: `guide`
- Page kind: `overview`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Orient readers to the main PikaCSS usage patterns and route them to the right next page for the pattern they need.

## Target reader

- Users who understand the core features and now need repeatable strategies for real projects.

## Prerequisites

- Route stage: The reader has completed the Core Features section.
- Capability: The reader is ready to combine multiple core features into repeatable strategies.

## Must include

- What a pattern means in the context of the PikaCSS docs.
- Why patterns are separate from raw feature reference.
- How responsive, dark-mode, and composition concerns fit together at a high level.

## Mental model

- Patterns are repeatable usage strategies that compose several core features into author-facing solutions for real projects.

## Example requirement

- Include one compact example showing several core features combined into a real usage pattern.

## Validation

- Readers should be able to decide whether they need a feature page or a pattern page for the next question they want to answer.

## Common pitfalls

- Rewriting Core Features content instead of showing cross-feature strategy.
- Keeping examples too small to demonstrate an actual usage pattern.
- Pulling plugin setup into a page that should stay focused on feature composition.

## Required API links

- The core package reference page when a pattern depends on exact selector, variable, or shortcut terminology.
- Exact package reference links only when a leaf pattern page truly depends on them.

## Must not include

- Repetition of detailed feature reference.
- Plugin-specific setup that belongs in Plugins.

## Link contract

- Incoming route-local: `../core-features/index.md` and `../core-features/shortcuts.md`.
- Incoming cross-route: None.
- Outgoing route-local: `responsive.md`, `dark-mode.md`, `composition.md`, and `../plugins/index.md`.
- Outgoing cross-route: None.

## Source of truth

- `packages/core`
- examples in `docs/.examples/`

## Notes

- Keep this page as the bridge into larger authoring strategy.