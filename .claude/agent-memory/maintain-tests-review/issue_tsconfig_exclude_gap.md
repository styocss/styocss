---
name: issue-tsconfig-exclude-gap
description: fix/tests-tsconfig-exclude review — closed the inherited-exclude gap that made 8 packages' tsconfig.tests.json check zero test files
metadata:
  type: project
---

`fix/tests-tsconfig-exclude` (reviewed 2026-08-18) closed an infra gap engine-review found during #118: `tsconfig.tests.json` in 8 packages (core, integration, nuxt, plugin-fonts, plugin-reset, plugin-typography, unplugin, eslint-config) extended `tsconfig.package.json`, whose `exclude: ["./src/**/*.test.ts"]` was inherited un-overridden. Since the child's `include` was *also* `./src/**/*.test.ts` only, exclude silently cancelled include and `pnpm typecheck` checked zero test files in those packages for an unknown span of time. `plugin-design-tokens` already had the correct pattern (`include: "./src/**/*.ts"` + explicit `"exclude": []`); `plugin-icons` never had the bug because its `tsconfig.package.json` has no `exclude` key at all.

Verdict: approve, no blocking findings. Fix + 5 mechanical downstream type-error repairs (context-arg additions, a `defineEnginePlugin<void>` annotation, an unused-param drop, two casts) — all verified not to weaken any assertion.

**Why this matters:** a tsconfig-only fix (no runtime code change) is easy to review by pattern-matching "the new config looks like the working one" without ever proving the *old* config was actually broken. Reviewing this class of change credibly requires reproducing the failure, not just admiring the diff.

**How to apply:** for any tsconfig-only fix, copy the pre-fix config (`git show HEAD:<path>`) into the live package directory under a throwaway filename (do this *inside* the package dir, not `/tmp` — `extends` resolves relative to the config file's own location, so moving it elsewhere breaks the `extends` chain and gives a false read) and run `npx tsc -p <throwaway>.json --listFiles --noEmit`. Compare the `.test.ts` file count / error before and after. This is the tsconfig analogue of the "verify a bug-fix test actually fails on the pre-fix source" rule in [[issue_117_config_immutability]] — same principle, different mechanism (config resolution vs. runtime behavior).

Also cross-check every package's `tsconfig.package.json` for the same `exclude` pattern before accepting "N packages fixed" as complete — that's what surfaced `plugin-icons` needing no change (no `exclude` key present) versus the 8 that did.
