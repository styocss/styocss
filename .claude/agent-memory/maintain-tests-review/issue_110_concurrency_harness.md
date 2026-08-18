---
name: issue-110-concurrency-harness
description: Status of GitHub issue #110 (deterministic concurrency regression harness) test-only changes and their relationship to #109/#111/#112/#113.
metadata:
  type: project
---

Issue #110 ("test: add deterministic concurrency coverage for generated artifacts") is test-infrastructure-only, reviewed 2026-08-17. Parent #109; blocks #111 (runtime CSS isolation fix); provides the shared harness #112 will use after #113 makes typegen deterministic.

Files: `packages/_shared/vitest.ts` (added `createGate()` alongside existing `createDeferred()`), `packages/integration/src/ctx.concurrency.test.ts` (new, primary deterministic harness — two `createCtx()` actors sharing one tmp root, FIFO `vi.mock('node:fs/promises')` write-gates, semantic CSS oracle via a brace-matching regex parser that correctly handles the real pretty-printed nested `@layer utilities { .pk-a {...} }` output), `packages/unplugin/src/index.vite-concurrent.test.ts` (new, serve+serve real-Vite smoke), `packages/unplugin/e2e/vite-build.mjs` (added build+build and serve+build real-Vite smoke scenarios).

Review verdict: no blocking findings. All three `it.fails` regressions (serve+serve, serve+build, build+build shared-CSS-artifact corruption) were confirmed by temporarily un-skipping them to fail for the exact semantic reason (opposite class-id-to-declaration mapping) documented in the issue, not a fixture/setup crash. Coverage thresholds met on both `integration` (98%+) and `unplugin` (99%+), `pnpm test:e2e` passes, eslint clean, both typechecks clean — matches the implementer's reported validation.

**Why this matters for future reviews:** when #111 lands and converts these `it.fails` tests to ordinary `it`, that PR's diff will be a small, easily-verifiable signal (removing `.fails`) — flag it if the corresponding assertion logic changes at the same time, since that would blur "we fixed the bug" with "we weakened the oracle." Same applies to #112 for the typescript-declaration-writer-contention test in the same file, and to #112/#113 for the byte-identical-inputs oracle explicitly deferred out of #110.

**Non-blocking residual risk noted:** the typegen writer-contention test (`ctx.concurrency.test.ts`, "overlapping declaration writers...") fully serializes the actual `fs.writeFile` calls via the gate (second writer's real disk write never starts until the first's completes), so it validates "last released writer's complete content wins" but cannot exercise true OS-level byte-interleaved write corruption. This is consistent with the issue's explicit scoping (no lock/election semantics, #112 owns the real write strategy) and the test's own "orchestration contract only" comment — flagged as residual risk, not a defect.
