# Contributing to PikaCSS

Thanks for your interest in contributing! This guide covers the essentials for
working in the monorepo.

## Prerequisites

- Node.js **>= 22**
- pnpm **10.x** (`corepack enable` recommended)

## Setup

```bash
pnpm install
```

## Common commands

```bash
pnpm test                              # run the full test suite
pnpm typecheck                         # type-check every package
pnpm lint                              # lint (non-fixing; CI uses this)
pnpm lint:fix                          # autofix lint issues locally
pnpm build                             # build all packages (dist)

# Prefer package-scoped commands while iterating:
pnpm --filter @pikacss/<package> test
pnpm --filter @pikacss/<package> typecheck
pnpm --filter @pikacss/<package> build

pnpm docs:dev                          # run the docs site
pnpm playground:dev                    # run the in-browser playground
```

Downstream packages test against built upstream `dist/` output. After changing
an upstream package (e.g. `@pikacss/core` or `@pikacss/integration`), rebuild it
before validating consumers:

```bash
pnpm --filter @pikacss/core build
```

## Project layout

```
core → integration → unplugin → nuxt
plugin-* → depend on core
```

Each package keeps tests co-located with source and carries its own
`tsconfig`, `tsdown`, and `vitest` config. Repository-wide agent/contributor
rules live in [`AGENTS.md`](./AGENTS.md).

## Making changes

- **Keep changes focused.** One logical change per pull request.
- **Match the existing style.** ESLint (`@deviltea/eslint-config`) is enforced;
  a pre-commit hook runs `eslint --fix` on staged files.
- **Every bug fix ships with a regression test** that fails without the fix,
  co-located with the code it covers.
- **Coverage thresholds** (95% branches/functions/lines/statements) are
  enforced per package; add tests for new branches in the same change.
- **Public API changes** must update the affected package's `public-api`
  snapshot test and the relevant JSDoc/docs. Treat the exported surface as a
  stability contract (see [MIGRATION.md](./MIGRATION.md)).
- **Docs and generated API reference**: use the documented docs workflow; do
  not hand-edit generated `pika.gen.*` or `docs/api/*` files.

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):
`type(scope): imperative summary` where type is one of
`feat|fix|docs|refactor|test|chore`. Mark breaking changes with `!` and a
`BREAKING CHANGE:` footer. Release notes are generated from commit history.

## Validation before opening a PR

Run the smallest credible gate for the area you touched (package-scoped test +
typecheck). For cross-cutting changes, run the repo-wide `pnpm lint`,
`pnpm test`, and `pnpm typecheck`.

## Publishing

Publishing is maintainer-only: a `Bump version` workflow run, a version pull
request, and a hand-pushed tag that triggers the `Release` workflow (npm
trusted publishing). [RELEASING.md](./RELEASING.md) has the walkthrough. See
[MIGRATION.md](./MIGRATION.md) and [SUPPORT.md](./SUPPORT.md) for the
versioning and support policy.
