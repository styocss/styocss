---
name: issue-117-config-immutability
description: Issue #117 (cloneEngineConfig / caller-owned config immutability) review — empirically confirmed two of four new engine.test.ts tests pass with the fix reverted (do not catch the regression); request-changes.
metadata:
  type: project
---

Reviewed fix/117-immutable-config: `packages/core/src/config-clone.ts` (new, `cloneEngineConfig`) called at the top of `createEngine` (`packages/core/src/engine.ts:84`). New tests: `config-clone.test.ts` (8 unit tests, 100% branch coverage confirmed via `coverage-final.json`), `engine.test.ts` describe('caller-owned config immutability (#117)') (4 tests), `plugin-design-tokens/src/reuse.test.ts` (1 test).

**Verification method used**: could not edit repo files (read-only review), so copied `packages/core` + `packages/_shared` to `/tmp`, reverted the one fix line, and ran a standalone `tsx` harness reproducing each `engine.test.ts` #117 test body directly (bypassing vitest's tsconfig-resolution issues in a relocated copy). This is the reliable pattern for "would this test fail without the fix" when Bash/Read-only tools forbid touching the actual repo — copy to /tmp, revert, run with tsx, delete when done.

**Key finding**: of the 4 engine.test.ts tests, only 2 (`configure-hook mutation` and `sequential reuse/accumulator`) actually fail when the fix is reverted. The other 2 do NOT:
- `'leaves core-only nested config untouched through the full setup lifecycle'` (line 755) — passes with or without the fix, because none of the built-in core plugins (variables/shortcuts/keyframes/selectors/important) mutate the raw config object in place; the test uses no custom mutating plugin, so it never exercises a mutation path.
- `'concurrently created engines ... cannot observe each other's working copies'` (line 830) — passes with or without the fix, because the plugin sets a brand-new top-level `config.marker` property. `createEngine` already did `config = { ...config, plugins }` (a fresh top-level object per call) *before* the #117 fix existed, so a new top-level key was already call-isolated. To actually test the concurrency hazard the #117 fix addresses, the plugin must mutate a **pre-existing nested** property from the caller object (e.g. `config.layers.something`), the same way the sequential accumulator test does, but with overlapping `await`s.

General lesson: a config-immutability/concurrency regression test must mutate a nested, pre-existing caller property — not a fresh top-level key — or it will pass regardless of whether the clone/isolation fix is present, because JS object spread already isolates top-level keys per call.

See also [[issue_116_plugin_reuse_state]], [[issue_114_transactional_prepare]], [[issue_115_diagnostic_scope]], [[issue_112_ts_atomic_writes]] for the running pattern of "test that would pass without the fix" findings across this repo's #11x series.
