# Information Architecture

Use this reference when deciding where docs pages belong, how top-level navigation should behave, and which reader route a page is meant to support.

This file defines the primary IA contract for `maintain-docs`.

## Objectives

- Organize docs by reader task and adoption stage, not by internal package layout.
- Keep the main learning route obvious for new users.
- Separate consumer guidance from plugin author guidance.
- Treat API and supporting material as reference and support surfaces, not as the primary learning spine.
- Keep English and `zh-TW` structures fully mirrored.

## Reader model

The docs serve four primary reader routes:

1. New adopters who need to install PikaCSS, get it running, and learn the core model.
2. Existing users who need targeted reference material for configuration, APIs, or plugin usage.
3. Plugin authors who need to extend the engine.
4. Users and contributors who need troubleshooting, contribution guidance, or recommended supporting resources.

When placement is ambiguous, choose the page location based on the reader's next action.

## Top-level taxonomy

The IA is organized into four top-level groups:

| Group | Purpose | Primary reader route |
|---|---|---|
| Learn | Main adoption and usage path for consumers | New adopters and everyday users |
| Extend | Authoring and extension path | Plugin authors |
| Reference | Lookup-oriented material | Users who already know what they need |
| Help | Troubleshooting, community, and supporting resources | Users who are blocked or exploring adjacent resources |

These groups are IA concepts first. They do not need to appear as literal top-level folders in the docs tree.

## Section map

### Learn

| Section | Directory | `category` | Role |
|---|---|---|---|
| Getting Started | `docs/getting-started/` | `getting-started` | First-run onboarding and shortest path to value |
| Framework Integrations | `docs/guide/integrations/` | `guide` | Framework-specific setup after initial onboarding |
| Configuration | `docs/config/` | `config` | Core non-plugin configuration reference that Learn pages link into |
| Core Features | `docs/guide/core-features/` | `guide` | Core engine concepts and feature model |
| Patterns | `docs/guide/patterns/` | `guide` | Reusable usage strategies built on core features |
| Plugins Ecosystem | `docs/guide/plugins/` | `guide` | How to use official or third-party plugins as a consumer |

### Extend

| Section | Directory | `category` | Role |
|---|---|---|---|
| Plugin Development | `docs/plugin-development/` | `plugin-dev` | Author-facing plugin APIs, lifecycle, and extension design |

### Reference

| Section | Directory | `category` | Role |
|---|---|---|---|
| API Reference | `docs/api/` | `api` | Generated or source-aligned API lookup pages |

### Help

| Section | Directory | `category` | Role |
|---|---|---|---|
| Troubleshooting | `docs/troubleshooting/` | `troubleshooting` | Diagnose and resolve user problems |
| Contributing | `docs/contributing/` | `contributing` | Project contribution and maintenance entry points |
| Skills | `docs/skills/` | `skills` | Recommended user-facing supporting resources |

## Route order

The default consumer learning path is:

1. Getting Started
2. Framework Integrations
3. Configuration
4. Core Features
5. Patterns
6. Plugins Ecosystem

This route defines the default direction for overview pages, `## Next` links, and cross-page escalation.

## Placement rules

- Place pages by reader task and next decision, not by source package ownership.
- ESLint belongs under Getting Started because it is part of a successful adoption path.
- Configuration is formally part of Learn even when individual pages are reference-style in tone.
- Configuration pages cover shared configuration concerns and should link outward to plugin-specific configuration pages when behavior is owned by a specific plugin.
- Plugins Ecosystem covers plugin consumption only. It does not teach plugin authoring.
- Plugin Development covers plugin authoring only. It does not duplicate plugin usage guides.
- API Reference is lookup-first content. It does not carry the main conceptual teaching burden.
- Help is a reroute hub, not a secondary learning spine.
- Troubleshooting is for failure states, debugging, and recovery paths, not for first-time onboarding.
- Skills are supporting resources that may be recommended from Learn pages. The Skills overview may be surfaced immediately after Getting Started as an early guided off-ramp, but the rest of Help is still secondary to the main learning spine.
- Do not create a standalone Advanced bucket. Advanced topics should be absorbed into the most relevant Learn or Extend section.

## Overview page policy

- Every Learn section must have an overview page that acts as an entry point and routing page.
- Extend sections should have an overview page unless the section is intentionally a single-page entry.
- Reference and Help sections may use a compact index page when that better matches lookup behavior.
- Overview pages should explain when to continue in the current section and when to jump to another route.

## Navigation policy

### Top navigation

- Top navigation should expose only the highest-value entry points.
- Top navigation is not the full taxonomy.
- Prefer links that represent route entry pages rather than deep pages.
- Supporting surfaces may be grouped under a secondary menu instead of occupying first-line nav space.

### Sidebar

- Sidebar should express the richer taxonomy that top navigation intentionally omits.
- Sidebar order should follow reader progression, not alphabetical order.
- Learn sections should appear in route order.
- Reference and Help content should remain visible but visually secondary to the Learn route.

## Current navigation mapping

Translate the current VitePress navigation in `docs/.vitepress/config.ts` into the IA above with the following mapping:

| Current nav item | Current link | New IA role | Required action |
|---|---|---|---|
| Guide | `/getting-started/` | Learn entry point | Rename the UI label to `Learn` and keep it as the primary learning entry |
| Config | `/config/` | Learn section with reference-style content | Keep it visible, but present it as part of the Learn route rather than as a separate peer route |
| API | `/api/` | Reference surface | Keep as lookup-oriented navigation, not as a peer learning route |
| Plugins | `/guide/plugins/reset` | Learn section entry | Change the link target to `/guide/plugins/` so the nav points to the Plugins overview instead of a leaf page |
| More | mixed links | Extend and Help overflow | Split it into explicit Extend and Help responsibilities instead of a catch-all bucket |

Recommended top navigation shape:

- Primary learning entry labeled `Learn`: `/getting-started/`
- Optional secondary learning entry if needed: `/guide/plugins/`
- Learn configuration entry: `/config/`
- Reference entry: `/api/`
- Extend entry or overflow item: `/plugin-development/`
- Help overflow: troubleshooting, contributing, and skills

## Current sidebar mapping

| Current sidebar group | Current role | New IA role | Required action |
|---|---|---|---|
| Getting Started | Learn | Learn | Keep first, but add an overview page and expand the route beyond installation, basic usage, and eslint |
| Core Features | Learn | Learn | Keep after Configuration, not before Integrations |
| Patterns | Learn | Learn | Keep after Core Features |
| Plugins | Learn | Learn | Add an overview page and keep after Patterns |
| Integrations | Learn | Learn | Move earlier so it sits directly after Getting Started |
| Configuration | Learn | Learn | Keep visible in the learning path as a Learn-owned reference-style hub rather than a late appendix |
| API Reference | Reference | Reference | Keep as lookup content after the main Learn and Extend surfaces |
| Advanced | Mixed catch-all | Remove standalone bucket | Split its pages back into the owning Learn or Extend sections |
| Help | Support | Help reroute hub | Keep as the home for troubleshooting, contributing, and skills without presenting it as a linear route |

Recommended sidebar order:

1. Getting Started
2. Skills Overview
3. Integrations
4. Configuration
5. Core Features
6. Patterns
7. Plugins
8. Plugin Development
9. API Reference
10. Help

Required sidebar changes:

- Add a Getting Started overview page.
- Rename `Basic Usage` to `First Pika`.
- Add `Generated Files` under Getting Started.
- Surface `Skills Overview` immediately after `ESLint Setup` as an early guided off-ramp from Getting Started.
- Move Integrations above Configuration and Core Features.
- Add a Plugins overview page and point the top nav there.
- Add `Atomic order and cascade` under Core Features.
- Remove the standalone Advanced group and redistribute its pages.
- Move Plugin Development out of Advanced and give it its own group between Plugins and API Reference.
- Keep Troubleshooting, Contributing, and Skills together under Help as a support hub.
- Rename the primary top-nav entry from `Guide` to `Learn`.
- Apply the same structural reorder to `zh-TW` so both locales remain mirrored.

## Page contract handoff

This file defines section-level IA only. Page-level content contracts should be maintained in separate page brief files under `references/page-briefs/`.

- Use `references/page-briefs/schema.md` for the required page brief shape.
- Use `references/page-briefs/README.md` for directory layout and naming rules.
- Use `references/route-linking.md` for cross-route linking rules and route transfer expectations.
- Group briefs by top-level IA route first, then by section.

Each page brief should define at minimum:

- Page purpose
- Target reader and prerequisites
- Required concepts
- Required example types when the page is instructional
- Explicit non-goals or out-of-scope topics
- Required incoming and outgoing links
- Source of truth

If a page cannot be summarized in that structure, its role in the IA is still underspecified.

## Example policy by section type

- Learn pages should normally include examples.
- Core Features and Patterns pages should explicitly define their required example style in the page brief.
- Configuration pages should use examples when a setting is difficult to understand without context.
- Reference and Help pages may omit examples when lookup clarity is more important than demonstration.

## Locale policy

- English is the source structure.
- `docs/zh-TW/` must mirror the English IA structure.
- Section names may be translated, but page presence, hierarchy, and routing intent must remain aligned.
- When English IA changes, `zh-TW` IA must be updated in the same maintenance pass unless the task is explicitly scoped otherwise.

## Home page

- `docs/index.md` uses `layout: home` with `hero` and `features` frontmatter.
- Keep the home page concise: short tagline, short feature details, no long prose sections.
- The home page should route readers into the Learn path first and expose supporting entry points second.
- The home page should obey the same route hierarchy as other pages: Learn first, then Extend/Reference/Help off-ramps.
- Update `docs/zh-TW/index.md` whenever the English home page changes.
- The home page does not use `relatedPackages`, `relatedSources`, `category`, or `order`.

## Future expansion points

The following details should be captured outside this file as the IA matures:

- Section-specific page inventories
- Additional route briefs outside Learn
- Migration rules from legacy page placement to the current taxonomy

## Notes on current repository state

- `docs/.vitepress/config.ts` already encodes a broad structure for both English and `zh-TW`.
- The docs content directories do not yet fully contain the corresponding Markdown pages, so the navigation mapping above should be treated as target structure rather than a record of already-finished migrations.
