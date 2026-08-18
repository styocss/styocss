---
name: verify-dist-freshness-by-content
description: How to confirm a built packages/*/dist/ actually reflects the branch under review, when file mtimes are unreliable
metadata:
  type: feedback
---

When checking whether a downstream package's test run exercised a real upstream `dist/` rebuild (required by AGENTS.md's "rebuild upstream before validating downstream" rule), do not trust filesystem mtimes on `dist/*.mjs` to decide freshness — in this sandboxed environment, dist mtimes have been observed to *predate* the git commit timestamps of the source changes they actually contain (likely clock/checkout artifacts, not a real staleness signal).

**Why:** During the #111 runtime-CSS-isolation review, `packages/integration/dist/index.mjs` showed an mtime earlier than the `fix!:` commit that changed `ctx.ts`. Trusting mtime alone would have produced a false "stale dist, validation proves nothing" finding. Grepping the dist file for the new symbols (`writeRuntimeCssFile`, `RUNTIME_STATE_DIRNAME`, `randomUUID` import, etc.) showed the build was in fact current.

**How to apply:** When validating that a downstream package (`unplugin`, `nuxt`) tested against a rebuilt upstream (`core`, `integration`), grep the target package's `dist/` output for a distinctive new identifier/string introduced by the source diff, rather than comparing `ls -la` timestamps against `git log` dates. Only report "validation proves nothing because dist wasn't rebuilt" after this content check fails.

**Recurrence:** Confirmed again during the #112 (`fix/112-deterministic-ts-writes`) review — `packages/integration/dist/index.mjs` mtime again predated the `ctx.ts` source commit by about a minute, and a content grep for `replaceGeneratedFile`/`writeScaffoldFile` again showed the dist was in fact current. Treat the mtime-lag artifact as a recurring property of this sandbox, not a one-off.

**Recurrence (2026-08-18, `fix/windows-writer-eperm-retry`):** Confirmed a third time — `packages/integration/dist/index.mjs` mtime again did not cleanly postdate every touched source file (specifically trailed the final `ctx.ts` comment-only edit by ~36s), yet a content grep for the new symbols (`renameWithRetry`, `RETRYABLE_RENAME_CODES`, `EPERM`) showed the dist was in fact current. Content-grep, not mtime-ordering, remains the only reliable signal in this sandbox.
