---
name: verify-causal-claims-in-comments
description: When a diff's comment says "X is required for invariant Y", trace Y's actual mechanism before accepting the claim as a correctness dependency
metadata:
  type: feedback
---

A comment/JSDoc claiming "doing X is required for invariant Y" is a claim, not evidence — trace Y's real mechanism before repeating it as fact.

**Why:** In fix/117 (`packages/core/src/config-clone.ts`), the code comment says copying-not-cloning the `plugins` array container (while preserving `EnginePlugin` definition identity) is "REQUIRED for #116's per-engine state store." Reading `createEngineHooks()` in `packages/core/src/plugin.ts` shows the `pluginContexts` WeakMap is scoped fresh per `createEngineHooks()` call (i.e. per `createEngine()` invocation) — so per-engine state isolation holds regardless of whether plugin definition identity survives cloning. The real reason identity preservation matters is external consumers (hosts, third-party WeakMaps) holding a reference to a reused plugin definition and expecting `===` to still hold — a real, separate, and valid guarantee, just not the one the comment names. The claim isn't false in effect (the special-case is still correct/valuable) but the causal attribution is imprecise.

**How to apply:** When a diff cites an issue number or named invariant as the reason for a design choice, don't just check that a matching regression test exists — open the mechanism it claims to protect (e.g. where the WeakMap/cache/lifecycle actually lives) and confirm the claimed dependency is real. Flag imprecise attribution as a low-severity doc nit even when the underlying code change is correct, since future readers will trust the stated reason over independently re-deriving it. See engine invariants in `AGENTS.md` for the canonical list this project pins with regression tests.
