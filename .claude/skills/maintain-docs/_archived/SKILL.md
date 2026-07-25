---
name: maintain-docs
description: 'Orchestrate PikaCSS documentation maintenance for docs drift, missing pages, examples, READMEs, and zh-TW sync. Use when: (1) analyzing docs coverage or stale content, (2) code changed and docs may need updates, (3) creating or updating guide/reference/advanced/API pages, (4) updating package READMEs, (5) translating or syncing zh-TW locale. This skill is executed directly by the main agent and uses maintain-docs-review for quality review.'
---

# Maintain Docs

## Scope boundary

- Covers English VitePress pages, zh-TW translations, docs examples, package READMEs, and docs navigation updates.
- English source content comes first; translation follows after English is correct.
- Exported-surface JSDoc maintenance is out of scope unless the user explicitly broadens the request.

## Required Inputs

- A scope: `analyze` (full scan), specific package names, page paths, section names, or behavioral areas.
- Whether the trigger is reactive (code changed) or proactive (user wants to improve/expand content).
- Any known changes, risk areas, or content constraints.

## Runtime surface

Entrypoint: `node ./.github/skills/maintain-docs/scripts/bootstrap.mjs <command>`

- Use `analyze` for docs audits and drift detection.
- Use `translate` for zh-TW sync flows.
- Use `verify --validated ...` only after successful docs validation to snapshot page verification state and clear `unknown` drift status.
- Use `install` only to refresh the prompt-adjacent runtime package.
- Prefer the bootstrap `--help` output for exact flags instead of restating every command shape here.

Runtime state is stored in `.maintain-docs/` (gitignored).

## References

- **[Content Policies](references/content-policies.md)** — ownership boundaries, source association, generated content, and README rules.
- **[Writing Conventions](references/writing-conventions.md)** — page metadata, prose style, internal links, and page endings.
- **[Markdown Authoring](references/markdown-authoring.md)** — VitePress Markdown features, containers, and snippet syntax.
- **[Example Authoring](references/example-authoring.md)** — docs example file structure, `pikain`/`pikaout`, and example validation.
- **[Translation](references/translation.md)** — zh-TW workflow and wording rules.
- **[Information Architecture](references/information-architecture.md)** — route ownership, section placement, and nav/sidebar targets.
- **[Route Linking](references/route-linking.md)** — cross-route link rules for Learn, Extend, Reference, and Help.
- **[Implementation Spec](references/implementation-spec.md)** — phase-level docs contract and rollout expectations.
- **[Page Briefs Guide](references/page-briefs/README.md)** — page-brief directory layout and boundaries.
- **[Page Brief Schema](references/page-briefs/schema.md)** — required brief structure and wording rules.
- **[Page Authoring Checklist](references/page-authoring-checklist.md)** — final page-level checks before review.
- **[Review Checklist](references/review-checklist.md)** — review gate for docs quality, contracts, and i18n consistency.

## Agent pairing

- Dedicated implementation agent: none
- Review agent: `maintain-docs-review`
- Execute this skill directly in the main conversation, then hand completed work to review.

## Orchestration

1. Consult [AGENTS.md](../../../AGENTS.md) before starting.
2. Resolve scope, trigger type, and any locale or content constraints.
3. If the request starts with an audit or translation-status question, run the docs runtime first.
4. Execute page edits, examples, README updates, and navigation changes directly in the main conversation.
5. Validate with docs-scoped commands after files change.
6. Hand off to `maintain-docs-review` for quality review before considering the work complete.
7. Stop and ask when ambiguity affects placement, source accuracy, example design, or translation structure.
