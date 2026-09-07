---
name: docs-review-handoff-expectations
description: Owner pre-runs the full docs validation battery before requesting review and expects findings only on what those checks cannot see
metadata:
  type: feedback
---

When handing docs work to `maintain-docs-review`, the owner runs the canonical `pnpm docs:check` gate himself first and states the result in the request, with an explicit instruction not to re-run it. When source code changed, the handoff also includes the `pnpm docs:status` impact summary so impacted-but-untouched pages become explicit review scope.

**Why:** Re-running passing checks burns time and produces no findings. The value he wants from review is the layer the tooling is blind to: third-party behavior claims that no repo source backs, cross-surface drift (AGENTS.md, README), repo-layout couplings that only break for other users' environments, and prose accuracy.

**How to apply:** Trust the reported check results, spend the effort on source-tracing behavior claims and on couplings that only fail outside this machine (Windows git symlinks, external tool schemas, git-clone vs tarball distribution). Say plainly when a claim is unverifiable in-repo and name the one action that would verify it, rather than hedging.
