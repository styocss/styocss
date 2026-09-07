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

```dot
digraph PikaCSS {
    rankdir=TB
    bgcolor="transparent"
    graph [pad=0.2, nodesep=0.35, ranksep=0.55]
    node [
        shape=box,
        style="rounded,filled",
        color="${#d1d5db|#4b5563}",
        fillcolor="${#f9fafb|#1f2937}",
        fontcolor="${#111827|#f3f4f6}",
        fontname="sans-serif",
        margin="0.12,0.08"
    ]
    edge [color="${#6b7280|#9ca3af}"]

    core [label="@pikacss/core"]
    config [label="@pikacss/config"]
    integration [label="@pikacss/integration"]
    unplugin [label="@pikacss/unplugin-pikacss"]
    nuxt [label="@pikacss/nuxt-pikacss"]
    reset [label="@pikacss/plugin-reset"]
    icons [label="@pikacss/plugin-icons"]
    fonts [label="@pikacss/plugin-fonts"]
    typography [label="@pikacss/plugin-typography"]
    designTokens [label="@pikacss/plugin-design-tokens"]

    config -> core
    integration -> config
    unplugin -> integration
    nuxt -> unplugin
    reset -> core
    icons -> core
    fonts -> core
    typography -> core
    designTokens -> core
}
```

## Next

- [Core API](/api/core) — engine functions, define helpers, and types.
- [Getting Started](/getting-started/what-is-pikacss) — introduction and setup.
