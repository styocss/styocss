---
title: Agent Skills
description: AI-assisted development skill for using and extending PikaCSS.
relatedPackages:
  - '@pikacss/core'
  - '@pikacss/unplugin-pikacss'
  - '@pikacss/plugin-icons'
  - '@pikacss/plugin-design-tokens'
relatedSources:
  - 'skills/pikacss-use/SKILL.md'
  - '.claude-plugin/marketplace.json'
category: integrations
order: 30
---

# Agent Skills

PikaCSS ships with an agent skill that provides AI-assisted guidance for both consuming and extending PikaCSS. Install it as a Claude Code plugin, or with the `skills` CLI for any other supported coding agent.

## Install

### Claude Code Plugin

In Claude Code, add this repository as a plugin marketplace, then install the plugin:

```text
/plugin marketplace add pikacss/pikacss
/plugin install pikacss@pikacss
```

Claude loads the skill on its own when your work matches its description; see [How to Trigger](#how-to-trigger) to invoke it explicitly. `/plugin marketplace update` refreshes the marketplace to the skill content on the repository's default branch, which can be ahead of the latest npm release.

### Skills CLI

For any supported agent, including Claude Code, install the skill directly with the [`skills` CLI](https://www.npmjs.com/package/skills):

```bash
npx skills add pikacss/pikacss --skill pikacss-use
```

Both paths install the same `skills/pikacss-use` content.

## pikacss-use

### When to Use

Use this skill when you are working with PikaCSS in any capacity:

- Setting up PikaCSS in a new project
- Configuring engine options or build integrations
- Using the configured `pika()` compile-time callable
- Consuming official plugins (reset, icons, fonts, typography, and design tokens)
- Troubleshooting transforms, generated files, TypeScript declarations, or configuration reloads
- Choosing neutral or Node.js runtime adapters for plugins that load local resources
- Creating a new engine plugin from scratch
- Implementing plugin hooks, structured diagnostics, and lifecycle behavior
- Extending `EngineConfig` with module augmentation
- Registering external configuration dependencies for file watching
- Writing plugin tests

### How to Trigger

The skill is automatically activated when your question relates to PikaCSS usage or plugin development. You can also explicitly mention "using PikaCSS", "PikaCSS setup", or "PikaCSS plugin development" in your prompt.

Installed as a Claude Code plugin, the skill is namespaced: invoke it with `/pikacss:pikacss-use`. Installed with the `skills` CLI, it is not namespaced and appears under its own name, `/pikacss-use`.

### Coverage

- Installation and supported integrations (Vite, Rollup, Rolldown, Webpack, Rspack, and Nuxt)
- Node.js, Vite, source-file, and static-analysis compatibility constraints
- Engine configuration and customization
- Generated runtime CSS and `.pikacss/pika.gen.ts` authoring state
- The configured `pika()` callable, project-selected output format, and static Pika extensions
- Official plugin consumption and configuration
- Neutral and Node.js plugin entry points
- ESLint integration
- TypeScript autocomplete support
- Plugin structure and `defineEnginePlugin`
- Lifecycle hooks, hook context, diagnostics, and execution order
- Config augmentation via TypeScript module augmentation
- Layer management and preflight injection
- Selector, shortcut, variable, keyframe, and design-token registration
- External config dependency watching
- Plugin testing patterns using `createEngine`

## Next

- [Setup](/getting-started/setup) — install PikaCSS in your project.
- [Plugin Development](/plugin-development/create-a-plugin) — create your own plugins.
