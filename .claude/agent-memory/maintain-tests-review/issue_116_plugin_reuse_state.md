---
name: issue-116-plugin-reuse-state
description: Review outcome for #116 (per-engine plugin state via createState/context.state) across core + 5 plugin packages — approved, no blocking findings.
metadata:
  type: project
---

#116 fixed a real closure-sharing bug: `EnginePlugin` factories (`reset()`, `typography()`, `fonts()`, `icons()`,
`designTokens()`) stored engine-local data (resolved config, CDN caches, violation counters, and — in icons — the
`engine` reference itself) in the factory's closure `let`/`const` bindings. Reusing one plugin *instance* across
two `createEngine()` calls (sequential or concurrent) let a later engine's config/engine silently overwrite an
earlier engine's already-registered long-lived callbacks (shortcut resolvers, `report()`/`strictTypes()` closures).
Fix: `EnginePlugin.createState()` + `context.state`, one context per plugin *definition* per engine, cached in a
`WeakMap<EnginePlugin, EnginePluginContext>` inside `createEngineHooks` (`packages/core/src/plugin.ts`).

Review verdict: approve, no blocking findings. Confirmed by direct reasoning (not just running the suite) that the
new "reuse" tests actually fail against the pre-fix closure code — e.g. reset/fonts/typography's sequential test
relies on the *shared* variable being overwritten by the second `configureRawConfig` call; icons' "A's shortcut
observes A's engine after B initializes" test catches the `let engine` reassignment specifically (old code would
route `engine.variables.add` for A's callback to engine B); icons' CDN-cache test catches cache being keyed only by
collection name, not by CDN host, so a shared cache would starve the second engine's fetch entirely.

Manual-context test helpers (`createContext(plugin)` / `createTestContext(plugin)`, repeated near-identically in
reset/typography/fonts/icons/icons-neutral test files) correctly mirror the real dispatcher: **one** context object
built per simulated engine and reused across every hook call for that engine — never rebuilt per hook. That fidelity
is the crux of whether these manual-context tests are meaningful; verified file-by-file.

Determinism: concurrent-isolation tests (core plugin.test.ts, plugin-design-tokens/reuse.test.ts) use
`createDeferred()` from `packages/_shared/vitest.ts`, gated by plugin `order: 'pre'` vs default ordering — no
timers/sleeps, same pattern approved for #110/#111 (see [[issue_110_concurrency_harness]]).

Noteworthy process lesson: the implementer was still actively editing `packages/core/src/plugin.ts` while this
review was in progress (context param went from optional-with-`context!.state` assertions to required-with-plain
`context.state`, mid-review, same-second mtimes so file-mtime comparison alone didn't catch it — only re-running
`git diff`/tests caught the change). **Always re-run the diff and the test/typecheck suite immediately before
finalizing a verdict**, don't rely on an earlier snapshot read at the start of the review.

Minor non-blocking nit carried over from before #116 (not introduced by it): `plugin-design-tokens/src/index.ts`
has `context?.onDiagnostic ?? noopDiagnosticHandler` even where `context.state` is accessed unconditionally one line
earlier (so `context` is already proven non-null) — vestigial optional chaining, cosmetic only.
