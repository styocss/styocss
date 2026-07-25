---
name: maintain-tests
description: 'Orchestrate PikaCSS unit and integration test maintenance for package-scoped updates or dependency-ordered full sweeps. Use when: (1) creating or updating unit/integration tests, (2) raising per-package coverage toward 100%, (3) targeted or full-sweep test maintenance, (4) review-driven test refinement. This skill is executed directly by the main agent and uses maintain-tests-review for quality review.'
---

# Test Maintenance

## Scope boundary

- Covers unit tests, package-internal integration tests, cross-package contract validation, and coverage-driven test refinement.
- Does not authorize coverage exceptions on its own; approval must come from the user.
- Docs content and exported-surface JSDoc are out of scope unless the user explicitly broadens the request.

## Required Inputs

- A package scope or `full sweep`.
- Source files, behaviors, or risk areas to cover.
- `full audit` or `focused update`.
- Any known exception candidates or constraints.
- Prefer `vscode_askQuestions` for clarification when available; otherwise ask in chat.

## Execution surface

- This workflow has no prompt-adjacent runtime package; execution happens through repository files, package-scoped commands, and direct implementation in the main conversation.
- Coverage policy, design rules, and example suites live in [references/testing-policy.md](references/testing-policy.md).

## Agent pairing

- Dedicated implementation agent: none
- Review agent: `maintain-tests-review`
- Execute this skill directly in the main conversation, then hand completed work to review.

## Orchestration

1. Consult [AGENTS.md](../../../AGENTS.md).
2. Resolve scope and whether the task is a focused update or a full sweep.
3. For full sweeps, validate in dependency order: `core` and `eslint-config`, then `plugin-*` plus `integration`, then `unplugin`, then `nuxt`.
4. Resolve test level before editing, preferring the lightest credible level first.
5. Execute test edits and package-scoped validation directly in the main conversation.
6. Handle coverage exceptions through explicit approval before continuing.
7. Hand off to `maintain-tests-review`, apply findings, and rerun targeted validation.
8. Stop and ask on ambiguity affecting scope, safety, coverage, or test level.
