# Releasing

Maintainer-only. Publishing uses npm trusted publishing (OIDC). All
`@pikacss/*` packages are versioned in **lockstep**.

## Stable release

Three steps. Only the first is automated; you do the other two.

1. **Run the `Bump version` workflow** (`workflow_dispatch`) with the desired
   `bump_type` (`patch` / `minor` / `major`). It bumps every `package.json`
   with `bumpp -r` and pushes a `release/v<version>` branch. Nothing is tagged
   or published. The run summary links to the next two steps.

2. **Open the pull request for that branch and merge it.** GitHub offers a
   "Compare & pull request" button; the run summary links there too. Merging is
   the gate — the diff you approve is exactly what gets published. Delete the
   branch instead to abandon the release.

3. **Tag the merged commit and push the tag.** This is what starts the publish:

   ```bash
   git switch main && git pull --ff-only
   git tag v<version> && git push origin v<version>
   ```

   `release.yml` then verifies the tag (name matches the manifests, commit is
   on `main`), rebuilds, re-checks packaging with `publint` + `attw`, publishes
   every package under `packages/`, writes the release notes with the
   lockfile-pinned `changelogithub`, and redeploys the docs. `repopack`
   triggers off the same tag on its own.

### Why steps 2 and 3 are manual

Branch protection blocks every direct push to `main`, including from Actions,
so the version commit has to arrive as a pull request. Automating the rest runs
into a single GitHub rule: **nothing done with `GITHUB_TOKEN` starts another
workflow run.**

- A branch pushed by a workflow gets no CI, so a pull request against it would
  never receive the required status checks and could never be merged.
- A tag pushed by a workflow would not trigger `release.yml`, so the publish
  would silently never happen.

Doing both by hand costs two clicks and one command, and keeps `main`
protected without granting Actions a bypass.

### One thing not to change

**Do not rename `release.yml`.** npm trusted publishing authorizes a specific
repository *and workflow filename*. Publishing from any other file fails the
OIDC exchange, and nothing local will warn you first.

There is no deployment environment on the publish job: the trusted publisher is
not scoped to one, and merging the pull request in step 2 is already the human
gate.

## Pre-publish gate

CI runs the full gate on the version pull request and again on `main` after the
merge, so the tree being published is the tree that was checked:

```
pnpm build && pnpm publint && pnpm attw && pnpm typecheck && pnpm test && pnpm test:e2e
```

- `publint` + `attw` (esm-only profile) verify the published package shape and
  type resolution. `release.yml` repeats them immediately before publishing.

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
