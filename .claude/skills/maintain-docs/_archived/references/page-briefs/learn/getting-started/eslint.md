# ESLint Setup

- Canonical docs path: `docs/getting-started/eslint.md`
- Route group: `learn`
- Section: `Getting Started`
- Category: `getting-started`
- Page kind: `tutorial`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Teach how and when to add ESLint support to a PikaCSS project.

## Target reader

- Users who already have basic PikaCSS setup working and want project hygiene and editor feedback.

## Prerequisites

- Route stage: Basic PikaCSS setup is already working.
- Capability: The reader understands the normal development loop well enough to add linting.

## Must include

- Why ESLint support matters in a PikaCSS workflow.
- How to install and enable the recommended config.
- What kinds of mistakes the linting setup is expected to catch.
- When readers can defer this setup and when they should not.

## Example requirement

- Include one ESLint config example and one short before-or-after linting example.

## Must not include

- General JavaScript linting theory.
- Framework-specific setup beyond the minimum needed to place the config.

## Link contract

- Incoming route-local: `generated-files.md` and `installation.md`.
- Incoming cross-route: Troubleshooting pages for configuration quality issues.
- Outgoing route-local: `../integrations/index.md`, `../configuration/index.md`, and `../core-features/index.md`.
- Outgoing cross-route: `../../help/skills/index.md` as the guided-support off-ramp after setup, and `../../reference/api/eslint-config.md` when the reader needs exact package-surface lookup.

## Source of truth

- `packages/eslint-config`
- root ESLint configuration files

## Notes

- Keep ESLint in Getting Started.