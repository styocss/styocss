# Contributing to PikaCSS

Thanks for your interest in contributing!

## Prerequisites

- Node.js **>= 22**
- pnpm **10.x** (`corepack enable` recommended)

## Setup

```bash
pnpm install
```

## Where the rules live

[`AGENTS.md`](./AGENTS.md) is the single source for everything else: the command
reference, the package graph, the engine invariants, the regression-test and
coverage rules, and the validation expected before a pull request. Read it
before your first change — it is written for both human contributors and
agents.

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):
`type(scope): imperative summary` where type is one of
`feat|fix|docs|refactor|test|chore`. Mark breaking changes with `!` and a
`BREAKING CHANGE:` footer. Release notes are generated from commit history.

## Related documents

- [RELEASING.md](./RELEASING.md) — publishing, maintainer-only.
- [MIGRATION.md](./MIGRATION.md) — upgrade steps and the public API stability
  contract.
- [SUPPORT.md](./SUPPORT.md) — supported Node versions, bundlers, and
  frameworks.
