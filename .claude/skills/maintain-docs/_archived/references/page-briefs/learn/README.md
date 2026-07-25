# Learn route inventory

This directory defines the canonical page inventory for the default consumer learning path.

## Route order

1. Getting Started
2. Integrations
3. Configuration
4. Core Features
5. Patterns
6. Plugins

## Page inventory

### Getting Started

- `getting-started/index.md` — route entry, adoption framing, and first branching decisions
- `getting-started/installation.md` — package installation and minimum setup
- `getting-started/first-pika.md` — first successful use of the engine
- `getting-started/generated-files.md` — generated artifacts and what they mean
- `getting-started/eslint.md` — linting workflow and project hygiene

### Integrations

- `integrations/index.md` — when to choose which integration path
- `integrations/vite.md` — Vite consumer setup
- `integrations/nuxt.md` — Nuxt consumer setup

### Configuration

- `configuration/index.md` — shared engine configuration reference and routing hub to plugin-specific config

### Core Features

- `core-features/index.md` — conceptual overview of the engine feature model
- `core-features/atomic-order-and-cascade.md` — ordering model and cascade expectations
- `core-features/selectors.md` — selector authoring model
- `core-features/variables.md` — variables and token-like value reuse
- `core-features/shortcuts.md` — shortcuts and composition primitives
- `core-features/keyframes.md` — animation definitions
- `core-features/preflights.md` — global base and preflight behavior

### Patterns

- `patterns/index.md` — when to combine core features into higher-level patterns
- `patterns/responsive.md` — responsive usage patterns
- `patterns/dark-mode.md` — dark mode strategies
- `patterns/composition.md` — composition patterns and layering choices

### Plugins

- `plugins/index.md` — plugin selection, when plugins are appropriate, and route into plugin-specific guides
- `plugins/reset.md` — reset plugin usage and tradeoffs
- `plugins/icons.md` — icons plugin usage and setup
- `plugins/fonts.md` — fonts plugin usage and setup
- `plugins/typography.md` — typography plugin usage and setup

## Naming notes

- `first-pika.md` replaces the looser `basic-usage` label because the route should emphasize the first successful engine outcome.
- `generated-files.md` and `atomic-order-and-cascade.md` are explicit additions not represented in the current sidebar.
- `plugins/index.md` is required because Plugins is a Learn section and therefore needs an overview page.
- `skills/index.md` remains Help-owned, but Learn may recommend it immediately after `getting-started/eslint.md` as a guided off-ramp.