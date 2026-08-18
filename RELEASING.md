# Releasing

Maintainer-only. Publishing uses npm trusted publishing (OIDC). All
`@pikacss/*` packages are versioned in **lockstep**.

## Stable release

One command, run locally from a clean, synced `main`:

```bash
pnpm release            # prompts for the version
pnpm release minor      # or name the bump up front
```

`scripts/release.ts` adds exactly one check and then hands over to `bumpp`:

1. **The script** refuses to start unless you are on `main` and local `main`
   matches `origin/main`.
2. **`bumpp -r --git-check`** does the rest: refuse a dirty tree, bump every
   workspace `package.json` in lockstep, prompt for the version, commit
   `chore: release v<version>`, create the annotated tag `v<version>`, then
   `git push` followed by `git push --tags`.

The branch is pushed before the tag, which is what `release.yml` needs — it
refuses a tag that is not an ancestor of `origin/main`.

The commit runs the repository's `pre-commit` hook, whose ESLint pass resolves
`@pikacss/eslint-config` through its `dist/`. If that directory is missing the
commit fails; `pnpm build` fixes it.

Once the tag lands, `release.yml` takes over: verify the tag, install, build,
run the pre-publish gate, re-check packaging with `publint` + `attw`, publish
every package under `packages/`, write the release notes with the
lockfile-pinned `changelogithub`, and redeploy the docs. `repopack` triggers
off the same tag on its own.

That docs redeploy is the only automatic one: `deploy-docs.yml` has no push
trigger. A docs-only change reaches `https://pikacss.github.io/` with the next
release, or sooner if you run the `Deploy docs to pikacss.github.io` workflow
manually.

### Why the script exists at all

`bumpp` covers everything except *where* it is releasing from. It checks that
the tree is clean, not that you are on an up-to-date `main`. Bumping on a
feature branch or on a stale `main` still pushes a tag, and the mistake only
surfaces in `release.yml` — by which point the tag is on origin and the version
number is spent.

### If the tag push fails

The version commit may already be on `main` while the tag is not, and nothing
has been published. The tag exists locally, so push it on its own:

```bash
git push origin v<version>
```

### Why the tag is pushed by hand

**Nothing done with `GITHUB_TOKEN` starts another workflow run.** A tag pushed
from a workflow would not trigger `release.yml`, so the publish would silently
never happen. `workflow_dispatch` and `repository_dispatch` are the only
exceptions to that rule, and neither is worth the indirection here.

`bumpp`'s version prompt is the human gate. There is no release pull request:
`main` is unprotected, the owner pushes to it directly, and a self-approved
pull request added a step without adding a reviewer.

### One thing not to change

**Do not rename `release.yml`.** npm trusted publishing authorizes a specific
repository *and workflow filename*. Publishing from any other file fails the
OIDC exchange, and nothing local will warn you first.

There is no deployment environment on the publish job: the trusted publisher is
not scoped to one, and `bumpp` already asked before pushing the tag.

## Pre-publish gate

`release.yml` runs the gate itself, on the exact tree the tag points at, ahead
of the publish step:

```
pnpm build && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm publint && pnpm attw
```

This is where the gate has to live. `ci.yml` does run on the version commit's
push to `main`, but it runs *in parallel* with `release.yml` — its result
arrives too late to stop a publish.

Running the same gate locally before `pnpm release` costs one command and turns
a failed publish run into a failed local run:

```bash
pnpm build && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm publint && pnpm attw
```

- `publint` + `attw` (esm-only profile) verify the published package shape and
  type resolution.

## Release-candidate flow (recommended before 1.0.0)

RC builds are published under the `next` dist-tag so they never become the
default `latest` install. The flow deliberately bypasses `pnpm release`: it
must **not** create or push a `v*` tag. Such a tag starts `release.yml`, which
publishes with no `--tag` argument — the RC would land on `latest`.

```bash
# 1. Bump to a prerelease version across all packages, without tag or push
pnpm exec bumpp -r 1.0.0-rc.1 --no-tag --no-push

# 2. Validate exactly as release.yml does
pnpm build && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm publint && pnpm attw

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
