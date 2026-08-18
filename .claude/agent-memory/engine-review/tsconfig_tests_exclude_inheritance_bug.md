---
name: tsconfig-tests-exclude-inheritance-bug
description: RESOLVED as of 2026-08-18 (feat/122 branch) — all packages now override exclude in tsconfig.tests.json; verify per-package before trusting typecheck, don't assume still-broken
metadata:
  type: project
---

**Status update (2026-08-18, branch `feat/122-watchable-icon-collections`): the repo-wide gap
described below has been fixed.** Verified directly (`tsc --project tsconfig.tests.json
--listFilesOnly`) that `core`, `integration`, `unplugin`, `nuxt`, `plugin-fonts`,
`plugin-reset`, `plugin-typography`, and `eslint-config` all now carry an explicit
`"exclude": []` in `tsconfig.tests.json`, with a comment explaining why. `plugin-design-tokens`
also has `"exclude": []`. `plugin-icons` still has no `exclude` override, but that's fine
structurally, not a leftover bug: its `tsconfig.package.json` was never given an `exclude` of
`*.test.ts` in the first place (it uses a narrow allowlist `include` — just `index.ts`/
`watchable.ts`/etc. — instead of an exclude pattern), so there is nothing for the child config
to inherit and neutralize. Confirmed `watchable.test.ts` and `index.vite-latedeps.test.ts`
(both newly added on this branch) are actually type-checked, not silently skipped.

**Original bug (kept for history):** `packages/*/tsconfig.package.json` sets `"exclude":
["./src/**/*.test.ts"]` (correct for the build config). `tsconfig.tests.json` extends that
file and adds an `include` for test files but, without its own `exclude` override, TS keeps
inheriting the parent's exclude, which silently cancels the child's include — `tsc --project
tsconfig.tests.json --listFiles` proved zero `*.test.ts` files were actually checked. This was
confirmed to have hidden a real missing-required-field bug in `core/src/plugin.test.ts` at the
time (see git history on `fix/118-host-project-root` if needed) — that repro is now stale
since the underlying tsconfig gap is closed; don't cite the specific missing-`host`-field
example as still-reproducible without re-checking.

**How to apply now:** Don't assume this is still broken — the default assumption should be
"probably fixed," but still spot-check with `tsc --project tsconfig.tests.json --listFilesOnly
--noEmit | grep '\.test\.ts'` for any package whose tsconfig files are touched by the diff
under review, or when a new package is scaffolded (`pnpm newpkg`/`pnpm newplugin`) — confirm
the scaffold template actually includes the `exclude: []` override or the narrow-include
pattern, since a new package could still be scaffolded without it.
Related: [[check_zh_tw_translation_frontmatter_sync]] — another case of "the check that should
have caught this doesn't actually run" (that one is still an active, recurring gap, unlike this
one).
