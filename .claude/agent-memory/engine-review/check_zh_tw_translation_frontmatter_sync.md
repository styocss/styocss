---
name: check-zh-tw-translation-frontmatter-sync
description: How to verify a docs/zh-tw/** edit bundled with a source fix actually bumped its translation: sourceBlob/sourceCommit frontmatter
metadata:
  type: feedback
---

When a diff touches both an English doc (`docs/**`) and its `docs/zh-tw/**`
counterpart, check whether the zh-tw file's `translation.sourceBlob`
frontmatter was bumped to match the new English content, not just whether the
zh-tw body text was translated.

**How to check without mutating the tree:** `git diff` shows `index
<old>..<new>` on the English file's diff header — the `<old>` hex prefix is
the pre-change blob hash. Read the zh-tw file's frontmatter
(`translation.sourceBlob`). If it still equals the English file's *old* blob
hash, the translator updated the body but skipped
`maintain-i18n:status --mark-synced`, leaving the tracked hash stale even
though the content is already in sync — AGENTS.md explicitly forbids
hand-editing the `translation:` block for this reason.

**Why:** Found in the #116 (plugin lifecycle) review: both
`docs/zh-tw/plugin-development/available-hooks.md` and
`create-a-plugin.md` had correctly translated new paragraphs, but
`sourceBlob` in each frontmatter still pointed at the pre-diff English blob
(verified via `git hash-object`/diff header comparison, no working-tree
mutation needed). This is a real, git-diff-visible hygiene gap, not a
hypothetical — check it every time a reviewed diff includes both an EN doc
and its zh-tw pair, even when the change looks purely additive.

**How to apply:** In every `engine-review` pass, if `git status`/diff shows
paired `docs/plugin-development/*.md` + `docs/zh-tw/plugin-development/*.md`
edits, diff the frontmatter block specifically and cross-check `sourceBlob`
against the EN file's pre-change blob hash from the diff header. Report as a
hygiene finding (not engine-invariant-blocking) if stale, with a concrete fix
（run `maintain-i18n:status --mark-synced`), pointing at [[engine-review-scope]].
