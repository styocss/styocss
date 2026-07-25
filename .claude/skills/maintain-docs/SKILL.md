---
name: maintain-docs
description: Orchestrate PikaCSS documentation maintenance for content drift, missing pages, heading conformity, and API reference generation. Use when: (1) analyzing docs coverage or stale content, (2) code changed and docs may need updates, (3) creating or updating guide/reference/config/plugin pages, (4) updating package READMEs, (5) regenerating API reference pages. This skill is executed directly by the main agent and uses maintain-docs-review for quality review. Translation/zh-TW work is out of scope for this version.
---

# maintain-docs

Orchestrate PikaCSS documentation maintenance. English pages only — translation is archived for future work.

## Source of Truth

Two reference files define the docs contract:

| File | Purpose |
|---|---|
| `references/content-architecture.md` | Page inventory — every page, its section, headings (H2/H3/H4) |
| `references/writing-guidelines.md` | How to write — frontmatter, prose style, links, examples, quality checklist |

Sidebar and nav are defined in a single VitePress config module:

| File | Purpose |
|---|---|
| `docs/.vitepress/sidebarAndNav.ts` | Exports `sidebar` and `nav` constants consumed by `config.ts` |

Keep `sidebarAndNav.ts` in sync with `content-architecture.md` when pages are added or removed.

Read both references before creating or updating any documentation page.
Before drafting content, read the exact source files that will back the page's `relatedSources`. Use those files to verify public config shapes, concrete CSS variable names, literal layer weights or order values, and any integration or build-tool behavior claims.
When a page teaches runtime or config behavior through reusable, behavior-sensitive examples, prefer checked `docs/.examples` imports over ad-hoc fenced code blocks so docs-scoped validation can verify the snippet through Vitest-backed example tests and/or docs typecheck. Inline fenced code is still acceptable for source-backed signatures, compact config skeletons, module augmentations, or other explanatory snippets where a standalone fixture would add little validation value.

## Templates

`templates/pages/` contains one markdown skeleton per page, organized by section. Each template provides standard headings and short guidance comments.

Template path maps 1:1 to docs path:
- `templates/pages/getting-started/setup.md` → `docs/getting-started/setup.md`

`templates/task.schema.json` defines the task file schema produced by `analyze`.

## Commands

All commands use monorepo-level `pnpm` scripts:

| Command | Purpose |
|---|---|
| `pnpm maintain-docs:analyze` | Compare templates against existing docs pages. Produces one `.task.json` per page in `.maintain-docs/tasks/`. |
| `pnpm maintain-docs:gen-api` | Generate API reference pages from exported surfaces and JSDoc. Reports JSDoc coverage gaps to stdout. |

Scripts live under `scripts/maintain-docs/` and use workspace-level devDependencies.

## Workflow

### 1. Analyze

Run `analyze` to produce task files:

```bash
pnpm maintain-docs:analyze
```

This checks every template against its corresponding docs page:
- **Page existence** — does the docs page exist?
- **Heading conformity** — do H2/H3 headings match the template?
- **Frontmatter validation** — are required fields present and valid?
- **Next section** — does the page end with `## Next`?

Output: one `.task.json` per page in `.maintain-docs/tasks/`, plus a stdout summary.

`analyze` is structural only. It does not prove that examples use valid public shapes, that automatic behavior claims are scoped correctly, or that `relatedSources` are precise enough.

### 2. Review Task Files

Read task files to identify work:

```bash
ls .maintain-docs/tasks/
```

Each task file contains:
- `status` — `missing` / `outdated` / `ok`
- `issues[]` — specific problems found
- `templatePath` — the matching template for scaffolding
- `docsPath` — the target docs file

### 3. Create or Update Pages

**For missing pages:**
1. Read the template from `templatePath`.
2. Read `references/writing-guidelines.md` for authoring rules.
3. Read the exact source files that will go into `relatedSources` before drafting examples, config tables, or behavior claims.
4. Fill in content following the template structure and guidance comments.
5. Add proper frontmatter with all required fields.
6. End with a `## Next` section.

**For outdated pages:**
1. Read the task file `issues[]` to understand what needs fixing.
2. Fix heading structure, frontmatter, or `## Next` section as needed.
3. Apply content quality rules from `writing-guidelines.md` — check for duplicate code-groups, missing `:::tip` containers for double-layer keys, undocumented API variants, stray `## Intro` headings, invalid public config shapes in examples, over-broad automatic behavior claims, wrapper integrations that fail to name the concrete auto-wiring mechanism, ordering claims that omit literal source-backed layer values, drifted placeholder names across related plugin-authoring pages, unvalidated fenced code where a checked `docs/.examples` fixture should be preferred, imprecise `relatedSources`, and missing required metadata on non-index pages.
4. Re-run `analyze` to confirm the issues are resolved.

**For API reference pages (`docs/api/*.md` except `index.md`):**

`docs/api/index.md` is a hand-authored overview page and should stay aligned with its template and `content-architecture.md` like any other docs page.

Package-level API reference pages are **always** generated by `gen-api-docs` — never hand-write or manually edit them.

```bash
pnpm maintain-docs:gen-api
```

If JSDoc coverage gaps are reported in stdout, ask the user whether to address them via the `maintain-jsdocs` workflow before proceeding.

If the generated links are stale (e.g. dead-link build failures), fix the `guideLink` data in `scripts/_skill-shared/index.ts` and re-run the generator in `scripts/maintain-docs/gen-api-docs.ts`. Do not patch the generated markdown directly.

### 4. Validate

After making changes, re-run `analyze` to confirm all addressed pages show `ok` status.

Before handoff, do a brief source-backed self-review: confirm examples use supported public shapes, automatic behavior claims are scoped to the exact integration or option that provides them, wrapper-package docs name the concrete generated file or template when that is what performs the work, ordering claims preserve literal source-backed values such as `-1`, placeholder plugin names stay aligned across neighboring authoring pages, `relatedSources` list the exact current source files, and every non-index page has complete required metadata.
If a page includes runnable or behavior-sensitive examples, confirm checked `docs/.examples` imports are used where they add real validation value. Inline fenced code is acceptable for signatures, type declarations, compact config fragments, or other explanatory snippets that are already source-backed and do not benefit from a dedicated fixture.

For example changes, run:

```bash
pnpm --filter @pikacss/docs test
pnpm --filter @pikacss/docs typecheck
```

## Runtime State

- `.maintain-docs/` — gitignored directory for task files and runtime state.
- `.maintain-docs/tasks/` — flat directory of task files, named with `--` separators (e.g., `getting-started--setup.task.json`).

## Agent Pairing

- **Execution**: main agent uses this skill directly.
- **Review**: hand off completed work to `maintain-docs-review` for quality gate.

## Scope Boundaries

- **In scope**: English docs pages, examples, package READMEs, API reference generation, nav/sidebar alignment, reading experience quality (content presentation, layout consistency, custom container usage).
- **Out of scope**: zh-TW translation — use the `maintain-i18n` skill (`.agents/skills/maintain-i18n/`), which owns `docs/zh-tw/**` and Taiwan-terminology enforcement. Also out of scope: direct editing of generated `dist/` or `coverage/` outputs.

## Sections

Pages are organized into these sections (from `content-architecture.md`):

| Section | Template directory |
|---|---|
| Getting Started | `templates/pages/getting-started/` |
| Integrations | `templates/pages/integrations/` |
| Customizations | `templates/pages/customizations/` |
| Official Plugins | `templates/pages/official-plugins/` |
| Plugin Development | `templates/pages/plugin-development/` |
| Troubleshooting | `templates/pages/troubleshooting/` |
| API Overview | `templates/pages/api/` |
| API Package Pages | Auto-generated by `gen-api-docs` — no templates |

## Archived Content

`_archived/` contains the previous skill version including translation workflows, page briefs, and the four-route IA system. These files are preserved for future translation work but are not referenced by the current skill.
