---
name: issue-114-transactional-prepare
description: Review outcome for #114 (engine.use split into prepareUse/commitUse for transactional module prepare) — clean determinism and mock design, one pre-existing/relocated branch gap in ctx.ts fullScan's empty-module skip never exercised.
metadata:
  type: project
---

Issue #114 ("fix: make module prepare transactional via prepareUse/commitUse split") on branch
`fix/114-transactional-prepare`, reviewed 2026-08-18. Splits `Engine.use()` (core `engine.ts`) into
`prepareUse()` (async, provisional: transformStyleItems → extract → new `transformStyleContents` seam →
normalize; allocates no IDs, mutates no `EngineStore`, fires no notifications) and `commitUse()`
(synchronous, mutation-critical: allocates/reuses atomic style IDs via live store state, fires
`atomicStyleAdded` wrapped in try/catch so a throwing observer is diagnosed but never rolls back the
commit). `packages/integration/src/ctx.pipeline.ts` mirrors this with `prepareModule`/`commitModule`/
`recommitModule` (old single `commitModule` split three ways); `ctx.ts`'s full scan gained a genuinely
concurrent Stage 2a (bounded-parallel `prepareModule` across files) followed by a Stage 2b sequential
commit in canonical sorted order for deterministic IDs — previously Stage 2 was one fully sequential
prepare+commit loop.

**Confirmed real regressions, not compile-only checks.** Traced by hand against the pre-diff code (old
`engine.use()` committed per call immediately, no try/catch around `notifyAtomicStyleAdded`, old
`ctx.ts` full-scan Stage 2 was single sequential loop, and old single-module `transform()` had an
*unconditional* `return rewriteModule(code, prepared)` even when the staleness check failed):
- `ctx.transactions.test.ts`'s "later failing call" and "last-good intact" tests fail under old code
  because `prepareModule`'s per-call `engine.use()` committed the first call to the store *before* the
  second call threw — old code left nonzero store state; new code correctly leaves zero.
- The "superseded revision discards finished provisional work" test fails under old code: red's
  gated `engine.use()` call committed to the store as a side effect *inside* `prepareModule`, regardless
  of the outer revision check that only gated `commitModule`/`state.prepared` — old code ends with 2
  store entries, new code with 1. This also incidentally proves the old code's stale return was
  unconditional (returned rewritten code for outdated content) — confirmed via manual code reading, but
  no pre-existing test asserted that old behavior, so nothing was weakened, just newly (and correctly)
  pinned.
- The "build-mode ids follow canonical commit order" test would *deadlock/timeout* under old code (fully
  sequential Stage 2, so `z.ts`'s hook — which must run to unblock `a.ts`'s gated hook — never gets a
  turn). A legitimate regression proof, just manifesting as a timeout rather than a wrong assertion.
- Both the core-level and ctx-level "throwing committed notification" tests fail under old code because
  `execSyncHook` (unchanged, `packages/core/src/plugin.ts`) already reports-then-rethrows on plugin hook
  error; only the new try/catch in `commitUse` (not present pre-#114) swallows that rethrow so the
  transform succeeds instead of failing the whole module.

**Mock realism verdict: sound, not vacuous.** `ctx.pipeline.test.ts`'s `makeEngine()` stands in the
opaque `StyleUsePlan` with a plain `string[]` (the final names) threaded untouched from `prepareUse` to
`commitUse`, because `ctx.pipeline.ts` itself never inspects the plan's internal shape — only real
`engine.commitUse()` does. This is a deliberate, correct layering: the pipeline unit tests exercise
plumbing/sequencing (that `prepareModule` never calls `commitUse`, that `commitModule` calls
`engine.commitUse` once per prepared call in list order), while the real `StyleUsePlan` shape (`{unknown,
contents}`) and its reuse-vs-fresh/order-sensitivity semantics are validated separately and for-real in
`engine.test.ts` and in `ctx.transactions.test.ts` (real `createCtx` + real engine, no engine mocking).
`ctx.test.ts`'s fully-mocked-`Engine` objects (mocking the whole `Engine`, not just one hook) correctly
split `use` into `prepareUse`/`commitUse` in the same style as before, and the commit mock's synchronous
firing of `atomicStyleAdded`/`autocompleteConfigUpdated` matches the real `commitUse` contract's
"synchronous, no interleaving window" design.

**Real finding (moderate, non-blocking, same shape as prior #112/#115 findings — see
[[issue_112_ts_atomic_writes]] and [[issue_115_diagnostic_scope]]):** in `ctx.ts`'s `fullScan`, Stage 2a's
`if (analyzed == null || analyzed.calls.length === 0) return` (skip module with zero pika calls before
provisional prepare) and Stage 2b's corresponding `if (prepared == null) continue` are never exercised
true by any test — confirmed via `coverage-final.json` branch ids 37 (line 489) and 39 (line 500), both
`[0, N]` (never-true). This guard's *behavior* (full scan skips files with no calls) is not new — it
existed in the old single sequential loop's identical condition — but it is new *code* at this location
after the Stage 1/2a/2b split, and no full-scan test in the suite mixes a zero-call file with a
has-calls file to exercise it. Package aggregate branch coverage still clears the 95% threshold
(integration: 95.38%) so CI is green. Worth a small follow-up test next time this file is touched (a
full scan over one file with a `pika()` call and one plain file with none).

**Housekeeping anomaly, still present, not touched by this review (owner call — see
[[issue_112_ts_atomic_writes]]):** the same stray mis-located reviewer-memory copy from #110 remains at
`packages/unplugin/.claude/agent-memory/maintain-tests-review/` (untracked, `??` in git status). Flagging
again since two reviews in a row have now noted it without anyone consolidating/removing it.

Coverage/typecheck confirmed directly, not just implementer claims: core 122 tests (98.73%/96.69% stmts/
branches), integration 324 tests (97.89%/95.38%), unplugin-pikacss 58 tests (99.18%/97.97%) — all clear
95% thresholds. `packages/core/dist` and `packages/integration/dist` both confirmed rebuilt after their
respective source edits (mtime check) before the unplugin suite (which imports built `@pikacss/
integration`) was run. Eslint clean on all five touched test files. See also
[[issue_110_concurrency_harness]] for the shared deferred-based determinism pattern this series keeps
reusing correctly.
