---
name: issue-112-ts-atomic-writes
description: Review outcome for #112 (TS declaration writes made concurrent-safe/idempotent via shared replaceGeneratedFile) and the recovery-assertion gap found in its regression test.
metadata:
  type: project
---

Issue #112 ("fix: make TypeScript declaration writes concurrent-safe and idempotent") landed on branch
`fix/112-deterministic-ts-writes` (commit `23cd3c7`), reviewed 2026-08-17. It generalizes the CSS-only
`writeRuntimeCssFile` into a shared `replaceGeneratedFile(filepath, content, tempDir)` in
`packages/integration/src/ctx.ts`, reused by both `writeCssCodegenFile` (temp dir outside the watched run
directory, for inotify reasons) and the new `writeTsCodegenFile` (temp dir = `dirname(tsCodegenFilepath)`,
because `tsCodegen` is a user-configurable, possibly-absolute path and the temp must share the target's
filesystem for atomic rename). This only became safe to rely on because #113 (already merged, `a057def`)
made typegen a pure projection of config — no usage-state — so equal-config concurrent writers now produce
byte-identical output, eliminating "winner" semantics as a design question.

Coverage confirmed via `pnpm --filter @pikacss/integration test -- --coverage`: 196 tests pass, branches
95.34% (package threshold 95%), and none of the uncovered `ctx.ts` lines (416, 460, 466, 489) fall inside
`replaceGeneratedFile`/`writeScaffoldFile` — the shared writer's identical-skip, temp-write-failure, and
rename-failure branches are all exercised, split across the pre-existing CSS-side test and the new
TS-side test. Typecheck (`pnpm --filter @pikacss/integration typecheck`) is clean too.

**Real finding (moderate, non-blocking but worth fixing next touch):** in `ctx.test.ts`'s new test
`'replaces the declaration file atomically and skips byte-identical rewrites (#112)'`, the "failed rename"
branch is reached by first `rm`-ing the target file, because TS codegen content is deterministic and
otherwise identical across calls in that test (no config change), so without removing the file the
identical-content check would short-circuit before ever attempting the write. But this means at the
moment `rename` is made to fail, there is no prior file to protect — so the assertion that follows
(a later *successful* retry reproduces `initialContent`) proves regeneration/idempotence, not that a
failed replacement leaves an *existing* target's old content untouched. The comment above the test
("a failed replacement propagates and keeps the previous complete declaration") overstates this. Compare
the CSS-side sibling test (`'skips byte-identical runtime CSS rewrites and cleans up when the replacement
fails'`, same file, ~line 1480): it forces different content via a real second `ctx.transform()` call and
asserts `readFile(target)` immediately after the failed rename still contains the *old* content — that
is the pattern that actually pins "failed rename never corrupts/replaces the existing file." The TS test
should do the analogous thing (e.g. write stale/garbage content directly to the target instead of
deleting it, forcing `current !== content` without erasing the file, then assert the stale content
survives immediately after the `rejects.toThrow`) to close this gap. Because `replaceGeneratedFile` is one
shared function, the CSS-side test already covers this invariant for the underlying code path in
general — so this is not a regression risk today, just an inaccurate test comment / missed opportunity
to pin the TS call site's own use of that invariant directly.

**Housekeeping anomaly (not part of this review's scope, flag to owner):** a stray, seemingly
mis-located copy of prior #110-era reviewer memory lives at
`packages/unplugin/.claude/agent-memory/maintain-tests-review/` (files `issue_110_concurrency_harness.md`,
`MEMORY.md`), instead of the canonical `.claude/agent-memory/maintain-tests-review/` documented in
`.claude/agent-memory/README.md`. It was not touched or deleted by this review (destructive/tracked-file
cleanup is an owner call), but future reviewers should know canonical lookups at the repo-root path will
miss it unless it's consolidated.

See also [[issue-110-concurrency-harness]] for the harness this #112 test extends (real-writer overlap
added alongside the pre-existing scripted-schedule self-tests).
