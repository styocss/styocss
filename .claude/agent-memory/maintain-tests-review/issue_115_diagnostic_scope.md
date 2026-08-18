---
name: issue-115-diagnostic-scope
description: Review outcome for #115 (per-generation build diagnostics + async-context module/generation attribution) — clean determinism, one real new-branch coverage gap in unplugin onDiagnostic's moduleId fallback.
metadata:
  type: project
---

Issue #115 ("fix: scope build diagnostics per generation with async module attribution") on branch
`fix/115-build-generation-diagnostics` (commit `664db51`), reviewed 2026-08-17.

New `packages/integration/src/diagnosticScope.ts` (AsyncLocalStorage-based `runWithDiagnosticScope`/
`getDiagnosticScope`) is wired into `ctx.ts` around per-module transform/full-scan work, and into
`packages/unplugin/src/index.ts` around per-generation build/watch work (`BuildGeneration` object with
`id`/`errors`/`closed`, replacing the old single mutable `collectedErrors`/`currentModuleId`).

Test design is sound: `diagnosticScope.test.ts` and `ctx.attribution.test.ts` use `createDeferred`
(`packages/_shared/vitest.ts`) for genuine forced interleaving (B fully completes before A's gate is even
resolved) — no sleeps, no timing luck. The unplugin `index.diagnostics.test.ts` mock uses
`vi.hoisted` + `importOriginal` to forward the REAL `runWithDiagnosticScope`/`getDiagnosticScope` from
built `@pikacss/integration` dist (confirmed dist/index.mjs rebuilt after the source edit, timestamps
checked) while everything else in that module stays mocked — sound, no hoisting hazard, because the
assignment happens inside the mock factory which only runs on the first dynamic `import('./index')`,
before any test invokes the stubbed `ctx.transform`. The three new regression tests (watch recovery,
stale-generation late diagnostic, interleaved adapter-level attribution) each fail for the right reason;
walked through by hand that the late-diagnostic test specifically would fail again if `const generation =
activeGeneration` in the transform handler were moved to *after* `await ensureSetup()` instead of at
handler entry — confirms it still pins that exact hazard.

**Real finding (moderate, non-blocking but worth a follow-up test):** the new `onDiagnostic` line
`generation.errors.push({ diagnostic, moduleId: scope.moduleId ?? null })` in `packages/unplugin/src/index.ts`
is genuinely new code (old version pushed a plain `currentModuleId` variable, no `??`). Its `null` fallback
branch is never exercised by any test — every error diagnostic in the test suite is emitted from inside a
module-scoped `ctx.transform`, never from project-level work (e.g. a plugin's `configureEngine` hook
erroring during `ensureSetup()` inside `buildStart`'s `runWithGeneration`). Confirmed via
`coverage-final.json`: branch id 20 (line 141, `scope.moduleId ?? null`) is `[5, 0]`, and the downstream
`buildEnd` formatting branch `moduleId != null ? ... : ''` (line 604) is likewise `[5, 0]` uncovered-false.
Package-aggregate branch coverage still clears 95% so CI is green, but per AGENTS.md's own rule ("a change
that adds branches adds tests for those branches in the same change") this is a same-PR gap, not a
pre-existing one — worth a project-level-error regression test next time this file is touched.

See also [[issue_112_ts_atomic_writes]] and [[issue_110_concurrency_harness]] for the same
deferred/createGate-based determinism pattern used across this concurrency-hardening series (#110, #112,
#113, #115).
