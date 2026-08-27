---
title: API Reference
description: Overview of all PikaCSS package APIs and exports.
relatedPackages:
  - '@pikacss/core'
  - '@pikacss/config'
  - '@pikacss/integration'
  - '@pikacss/unplugin-pikacss'
  - '@pikacss/nuxt-pikacss'
  - '@pikacss/plugin-reset'
  - '@pikacss/plugin-icons'
  - '@pikacss/plugin-fonts'
  - '@pikacss/plugin-typography'
  - '@pikacss/plugin-design-tokens'
  - '@pikacss/eslint-config'
relatedSources:
  - 'scripts/_skill-shared/index.ts'
  - 'AGENTS.md'
category: api
order: 0
---

# API Reference

PikaCSS is composed of several packages, each with a focused API.

## Package Overview

### Core Packages

| Package | Purpose |
|---------|---------|
| [`@pikacss/core`](/api/core) | Engine foundation — `createEngine`, `defineEngineConfig`, `defineEnginePlugin`, types |
| [`@pikacss/config`](/api/config) | Canonical project configuration — `defineConfig`, scan/report/config types |
| [`@pikacss/integration`](/api/integration) | Build-system bridge — project runtime, source transformation, generated state |
| [`@pikacss/unplugin-pikacss`](/api/unplugin) | Bundler adapters — Vite, Rollup, Rolldown, Webpack, Rspack |
| [`@pikacss/nuxt-pikacss`](/api/nuxt) | Nuxt module — zero-config Nuxt integration |

### Official Plugins

| Package | Purpose |
|---------|---------|
| [`@pikacss/plugin-reset`](/api/plugin-reset) | CSS reset injection |
| [`@pikacss/plugin-icons`](/api/plugin-icons) | Icon shortcuts via Iconify |
| [`@pikacss/plugin-fonts`](/api/plugin-fonts) | Web font loading |
| [`@pikacss/plugin-typography`](/api/plugin-typography) | Prose typography styles |
| [`@pikacss/plugin-design-tokens`](/api/plugin-design-tokens) | W3C design tokens to CSS variables |

### Tooling

| Package | Purpose |
|---------|---------|
| [`@pikacss/eslint-config`](/api/eslint-config) | ESLint rules for static analysis |

## Package Graph

```mermaid
graph TD
    core["@pikacss/core"]
    config["@pikacss/config"]
    integration["@pikacss/integration"]
    unplugin["@pikacss/unplugin-pikacss"]
    nuxt["@pikacss/nuxt-pikacss"]
    reset["@pikacss/plugin-reset"]
    icons["@pikacss/plugin-icons"]
    fonts["@pikacss/plugin-fonts"]
    typography["@pikacss/plugin-typography"]
    designTokens["@pikacss/plugin-design-tokens"]

    config --> core
    integration --> config
    unplugin --> integration
    nuxt --> unplugin
    reset --> core
    icons --> core
    fonts --> core
    typography --> core
    designTokens --> core
```

## Next

- [Core API](/api/core) — engine functions, define helpers, and types.
- [Getting Started](/getting-started/what-is-pikacss) — introduction and setup.
