# Releasing

Maintainer-only. Publishing runs through two GitHub Actions workflows using npm
trusted publishing (OIDC). All `@pikacss/*` packages are versioned in
**lockstep**.

## Stable release

Two workflows, two things for you to do.

1. **Run `Release — prepare`** (`workflow_dispatch`) with the desired
   `bump_type` (`patch` / `minor` / `major`). It bumps every `package.json`
   with `bumpp -r`, pushes a `release/v<version>` branch, and opens a pull
   request labelled `release`. Nothing is tagged or published yet.
2. **Merge that pull request** once its checks are green. This is the gate:
   the diff you approve is exactly what gets published.
3. `Release — publish` takes over automatically. It tags the merged commit,
   re-checks packaging (`build` + `publint` + `attw`) against the `dist/` about
   to ship, publishes every package under `packages/`, writes the release notes
   with the lockfile-pinned `changelogithub`, and redeploys the docs.

Close the pull request without merging to abandon a release.

### Why it is split

Branch protection blocks every direct push to `main`, this workflow included.
Routing the version commit through a pull request keeps the protection intact
instead of granting the GitHub Actions app a bypass that would apply to every
workflow in the repository. Tags are pushed in stage 2 because branch
protection governs branches, not tags.

## Pre-publish gate

CI runs the full gate on the release branch and again on `main` after the
merge, so the tree being published is the tree that was checked:

```
pnpm build && pnpm publint && pnpm attw && pnpm typecheck && pnpm test && pnpm test:e2e
```

- `publint` + `attw` (esm-only profile) verify the published package shape and
  type resolution. Stage 2 repeats them immediately before publishing.

Run the end-to-end check locally as well when touching the
integration/unplugin path:

```
pnpm build && pnpm test:e2e
```

## Release-candidate flow (recommended before 1.0.0)

RC builds are published under the `next` dist-tag so they never become the
default `latest` install:

```bash
# 1. Bump to a prerelease version across all packages
pnpm exec bumpp -r 1.0.0-rc.1

# 2. Validate exactly as CI does
pnpm build && pnpm publint && pnpm attw && pnpm typecheck && pnpm test && pnpm test:e2e

# 3. Publish under the `next` tag (not `latest`)
pnpm -r --filter='./packages/*' publish --no-git-checks --tag next
```

Install an RC for testing with `npm i @pikacss/unplugin-pikacss@next`.

Promote to stable only after the RC has been validated against real projects
(a real Vue app, a Nuxt SSR app, a monorepo, and Windows). Then run the normal
stable release flow above, which publishes to `latest`.

## Checklist before 1.0.0

- [ ] `P0` count is zero.
- [ ] All bundler adapter fixtures pass.
- [ ] At least one external real-project RC validation round.
- [ ] Public API snapshot tests reflect the intended, frozen surface.
- [ ] Docs no longer mark the API as unstable.
- [ ] `MIGRATION.md`, `SUPPORT.md`, `SECURITY.md` are current.
