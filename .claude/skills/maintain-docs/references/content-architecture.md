# Docs Global Architecture Draft

Conventions

- Group = sidebar group
- = page path and H1
- == H2
- === H3
- ==== H4
- API Reference consists of a hand-authored `/api/` overview plus generator-owned package pages under `docs/api/*.md`
- Template notation: {Template: ...} = agent fills in based on source code; content is not prescribed by this draft
- Config property template: each config section uses a table (Property | Description) with property names listed as rows. See API reference link below the table for full type signatures and defaults
- Config table property notation: {table: property1, property2, ...} = analyze checks these property names exist in the docs page table

Getting Started
= What is PikaCSS
== Key Features
=== Zero Config
=== Zero Runtime
=== From CSS-in-JS to Atomic CSS
=== Cascade Ordering Conflict Resolved
=== Powerful Plugin System
=== Fully Customizable
== Concept
=== How pika() Works
=== Statically Analyzable
=== Nested Selector (must cover: $:pseudo, @media, custom selector — three scenarios)
=== Cascade Ordering Conflict (shorthand/longhand conflict scenarios only; unrelated to @layer)
= Comparison (PikaCSS vs UnoCSS, Tailwind CSS, Panda CSS, vanilla-extract; honest pre-1.0 framing)
== At a Glance
== What Actually Differs
=== CSS-in-JS authoring, atomic CSS output
=== Shorthand/longhand cascade conflicts are resolved by the engine
=== Truly zero runtime, including the function itself
=== The trade-off: static-only arguments
== When Not to Use PikaCSS
= Setup
== Install
== Apply Vite Plugin (link to Integrations for other build tools)
== Import `pika.css`
== Generated Files
=== pika.gen.ts
=== pika.gen.css
= Usage
== pika() Variants (pika, pika.str, pika.arr, pikap, pikap.str, pikap.arr)
== Examples {Template: 3–5 examples, agent decides grouping and coverage}
= Dynamic Styles (patterns for runtime-driven styling under the static-analyzability constraint)
== Why the Constraint Exists
== Pattern 1: Variant Maps
== Pattern 2: CSS Variables for Truly Runtime Values
== Pattern 3: Shortcuts as Recipes
== Choosing a Pattern
= Engine Config
== Config
=== Core {table: prefix, defaultSelector, plugins, layers, defaultPreflightsLayer, defaultUtilitiesLayer, preflights, cssImports, important}
=== Customizations {table: autocomplete, selectors, shortcuts, variables, keyframes}
=== Plugin Config {table: reset, typography, icons, fonts, designTokens}
== Examples
= ESLint Config
== Setup
== Rules
=== no-dynamic-args
==== Description
==== What Counts as Static
==== Examples
= How PikaCSS Generates CSS
== The Pipeline
== Deduplication
== Last Wins Per Property
== `null` Removes a Property
== Value Fallbacks
== Output Ordering
== Layer Grouping

Integrations
= Agent Skills
== Install
== pikacss-use
=== When to Use
=== How to Trigger
=== Coverage
= Unplugin
== Supported Tools
== Config {table: scan, config, autoCreateConfig, fnName, transformedFormat, tsCodegen, cssCodegen}
= Nuxt
== What the Module Does
=== Vite Plugin Registration
=== CSS Auto-Import
=== Default Scan Patterns
== Config {table: scan, config, autoCreateConfig, fnName, transformedFormat, tsCodegen, cssCodegen}
= Frameworks (Vue, React, Solid wiring; snippets mirror the Playground templates)
== Vue
== React
== Solid
== Nuxt
== Other Markup Files
= SSR & Production
== SSR, SSG, and Streaming Just Work
== Production Builds
== What Triggers a Reload in Dev
== Type-Level Performance

Customizations
= Layers
== Config {table: agent decides rows based on implementation complexity}
== Examples
= Important
== Config {table: agent decides rows based on implementation complexity}
== Examples
= Preflights
== Config {table: agent decides rows based on implementation complexity}
== Examples
= Variables
== Config {table: agent decides rows based on implementation complexity}
== Examples
= Keyframes
== Config {table: agent decides rows based on implementation complexity}
== Examples
= Selectors
== Config {table: agent decides rows based on implementation complexity}
== Examples
= Shortcuts
== Config {table: agent decides rows based on implementation complexity}
== Examples
= Autocomplete
== Config {table: agent decides rows based on implementation complexity}
== Examples

Official Plugins
= Reset
== Config {table: reset}
= Typography (list available prose-* shortcuts: prose-base, prose-paragraphs, prose-links, prose-emphasis, prose-kbd, prose-lists, prose-hr, prose-headings, prose-quotes, prose-media, prose-code, prose-tables, prose; size variants: prose-sm, prose-lg, prose-xl, prose-2xl)
== Config {table: variables}
= Icons
== Config {table: prefix, mode, scale, collections, customizations, autoInstall, cwd, cdn, unit, extraProperties, processor, autocomplete}
= Fonts
== Config {table: provider, fonts, families, imports, faces, display, providers, providerOptions}
= Design Tokens
== Config {table: sources, themes, prefix, root, pruneUnused}

Plugin Development
= Create a Plugin
== Structure
== defineEnginePlugin
== order
= Available Hooks
== configureRawConfig
=== Signature
=== When
=== Example
== rawConfigConfigured
=== Signature
=== When
=== Example
== configureResolvedConfig
=== Signature
=== When
=== Example
== configureEngine
=== Signature
=== When
=== Example
== transformSelectors
=== Signature
=== When
=== Example
== transformStyleItems
=== Signature
=== When
=== Example
== transformStyleDefinitions
=== Signature
=== When
=== Example
== preflightUpdated
=== Signature
=== When
=== Example
== atomicStyleAdded
=== Signature
=== When
=== Example
== autocompleteConfigUpdated
=== Signature
=== When
=== Example
= Type Augmentation
== EngineConfig
== Engine
== PikaAugment
= Define Helpers
== defineEnginePlugin
== defineEngineConfig

= API Reference
== Package Overview
=== Core Packages
=== Official Plugins
=== Tooling
== Package Graph

Package API pages (auto-generated by scripts/maintain-docs/gen-api-docs.ts using package definitions from scripts/_skill-shared/index.ts; structure below is the generation spec)
== @pikacss/core
=== Functions
==== individual exported functions
=== Constants
==== individual exported constants
=== Types
==== individual interfaces and type aliases
=== Module Augmentations
==== individual augmented interfaces
== @pikacss/integration
=== Functions
==== individual exported functions
=== Constants
==== individual exported constants
=== Types
==== individual interfaces and type aliases
=== Module Augmentations
==== individual augmented interfaces
== @pikacss/unplugin-pikacss
=== Functions
==== individual exported functions
=== Constants
==== individual exported constants
=== Types
==== individual interfaces and type aliases
=== Module Augmentations
==== individual augmented interfaces
== @pikacss/nuxt-pikacss
=== Functions
==== individual exported functions
=== Constants
==== individual exported constants
=== Types
==== individual interfaces and type aliases
=== Module Augmentations
==== individual augmented interfaces
== @pikacss/plugin-reset
=== Functions
==== individual exported functions
=== Constants
==== individual exported constants
=== Types
==== individual interfaces and type aliases
=== Module Augmentations
==== individual augmented interfaces
== @pikacss/plugin-typography
=== Functions
==== individual exported functions
=== Constants
==== individual exported constants
=== Types
==== individual interfaces and type aliases
=== Module Augmentations
==== individual augmented interfaces
== @pikacss/plugin-icons
=== Functions
==== individual exported functions
=== Constants
==== individual exported constants
=== Types
==== individual interfaces and type aliases
=== Module Augmentations
==== individual augmented interfaces
== @pikacss/plugin-fonts
=== Functions
==== individual exported functions
=== Constants
==== individual exported constants
=== Types
==== individual interfaces and type aliases
=== Module Augmentations
==== individual augmented interfaces
== @pikacss/eslint-config
=== Functions
==== individual exported functions
=== Constants
==== individual exported constants
=== Types
==== individual interfaces and type aliases
=== Module Augmentations
==== individual augmented interfaces

Troubleshooting
= FAQ {Template: agent organizes H2 structure based on actual common issues}
