---
name: check-cross-page-behavior-drift
description: When a docs diff removes/changes a feature, check untouched adjacent pages whose behavior claims the same source commit silently invalidated
metadata:
  type: feedback
---

> The implementation names in the historical example below are superseded; the review lesson remains current. Verify present-day mechanisms from source before reusing its causal details.

For the #113 pikap()/preview removal review, the diff touched usage.md, eslint-config.md, agent-skills.md, ssr-and-production.md (one sentence) and the generated API pages — but `docs/integrations/ssr-and-production.md`'s "What Triggers a Reload in Dev" section (untouched by the diff) contained a claim that became false because of the *same* underlying source commit: "the generated files are rewritten only when the resolved styles actually changed" used to be true because `previewUsages` changes also drove `triggerTsCodegenUpdated()` (see pre-refactor `ctx.pipeline.ts`); after the refactor, `queueTsCodegenUpdated` is wired only to `autocompleteConfigUpdated` (`packages/integration/src/ctx.ts`), so `pika.gen.ts` is never rewritten by ordinary source edits regardless of style changes — only the CSS output is.

**Why:** `maintain-docs:analyze` and `check-contracts` are structural/scoped; they cannot see that a behavior claim on a page nobody edited quietly went stale because the underlying trigger wiring changed elsewhere in the same PR. This is exactly the "source-traceable behavior claim" layer [[feedback_review_handoff]] says tooling is blind to.

**How to apply:** After reading the PR's stated diff, grep the PR's own source commit message (`git log -1 <sha>`) for behavior nouns (triggers, determinism, hooks) and cross-check every doc page that describes that mechanism — not just the pages the diff touched — against the current source wiring (e.g. grep the actual hook registration, not just the removed lines).
