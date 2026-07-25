# Configuration Overview

- Canonical docs path: `docs/config/index.md`
- Route group: `learn`
- Section: `Configuration`
- Category: `config`
- Page kind: `reference`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Explain the shared configuration surface for Learn readers and route them to the right next page when configuration ownership changes.

## Target reader

- Users who have the basics working and need to understand or change configuration.

## Prerequisites

- Route stage: The reader has completed installation and at least one successful setup path.
- Capability: The reader is ready to inspect or change shared configuration behavior.

## Must include

- What settings belong in the shared configuration surface.
- How shared engine configuration differs from plugin-owned configuration.
- How readers should navigate the most important configuration decisions.
- When readers should leave this page for plugin-specific Learn pages or API lookup.

## Mental model

- Shared configuration is the cross-project contract for engine behavior, while plugin-owned configuration is an extension surface layered on top of that contract.

## Example requirement

- Include one minimal config example that demonstrates the shape of a real config file.

## Validation

- Readers should be able to identify which settings belong in shared config, which belong to plugins, and which questions require API lookup.

## Common pitfalls

- Treating Configuration as a dumping ground for every plugin option.
- Explaining feature-specific behavior in depth instead of routing into Core Features.
- Omitting links to exact config types or helpers when the page references them.

## Required API links

- `EngineConfig` and `defineEngineConfig` from the core package reference.
- The unplugin and Nuxt package reference pages for integration-owned config entry points.
- Plugin-specific package reference pages when the page points readers to plugin-owned config.

## Must not include

- Duplicated plugin option documentation.
- Deep per-feature tutorials that belong in Core Features.

## Link contract

- Incoming route-local: `../getting-started/installation.md`, `../getting-started/first-pika.md`, `../integrations/index.md`, `../integrations/vite.md`, and `../integrations/nuxt.md`.
- Incoming cross-route: Troubleshooting pages about misconfiguration.
- Outgoing route-local: `../core-features/index.md`, `../plugins/index.md`, and plugin-specific Learn pages as needed.
- Outgoing cross-route: API Reference pages when the reader needs exact exported config types or helper signatures.

## Source of truth

- `packages/core`
- integration package config surfaces
- official plugin packages for linked config ownership

## Notes

- Keep this page in Learn for visibility, but keep its content style reference-oriented.