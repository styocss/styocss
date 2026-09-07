---
name: maintain-i18n
description: Maintain the zh-TW docs locale — translate missing pages, incrementally sync stale translations against English source drift, and enforce Taiwan terminology. Use when adding or updating docs/zh-tw pages, when English docs changed and translations must catch up, or when checking translation freshness.
---

# maintain-i18n

Maintains `docs/zh-tw/**` as a strictly aligned translation of the English docs. English is the single source of truth; never edit English pages from this skill.

## Source of Truth

| Concern | Source |
|---|---|
| Content | English pages under `docs/` (excluding `docs/zh-tw/**`) |
| Sync state | `translation:` frontmatter block in each zh page (committed, reviewable) |
| Style rules | `references/translation-style.md` |
| Terminology | `references/terminology.md` (TW-vs-PRC) + `references/glossary.md` (PikaCSS terms) |
| Machine lint list | `scripts/maintain-i18n/forbidden-terms.json` |
| Out of scope | Generated `docs/api/*.md` (English-only by policy; only `api/index.md` is translated) |

## Commands

```bash
pnpm maintain-i18n:status                 # page states + freshness table; writes task files to .maintain-i18n/tasks/
pnpm maintain-i18n:status --json          # machine-readable report
pnpm maintain-i18n:status --mark-synced <docs/zh-tw/page.md ...>   # assert translation matches the current English blob
pnpm maintain-i18n:lint                   # forbidden-PRC-term scan, anchor conformity, fixture comment-only invariant
pnpm --filter @pikacss/docs test          # example tests (includes zh-tw fixtures)
pnpm docs:build                           # dead-link + twoslash gate
```

## Workflow

1. **Analyze.** Run `pnpm maintain-i18n:status`. Read the task files in `.maintain-i18n/tasks/`. Each task carries the page state (`missing` / `stale` / `orphaned` / `untracked`), freshness %, and for `stale` pages the exact English diff (`git diff <sourceBlob> <currentBlob>`) plus the fallback verdict (incremental vs full-retranslate, see Fallback Rules below).
2. **Translate.**
   - `missing`: translate the full current English page. Read `references/translation-style.md` and both terminology files FIRST. Preserve structure 1:1 (heading tree, container types, snippet includes, tables).
   - `stale` + incremental verdict: map each diff hunk to the corresponding zh section (hunks carry heading context) and edit only the affected passages. Do not reflow or reword untouched passages.
   - `stale` + full-retranslate verdict (task file says so): retranslate the whole page from current English, reusing established terminology.
   - `orphaned`: the English source was deleted or renamed. For renames (task file proposes the target) `git mv` the zh page, then treat as `stale`. For deletions, delete the zh page and fix inbound links.
   - Fixtures: if the diff touches files under `docs/.examples/`, update the mirrored `docs/zh-tw/.examples/` copies — comments translated, everything else byte-identical.
3. **Mark synced.** `pnpm maintain-i18n:status --mark-synced <pages...>`. This is an explicit assertion that the translation matches the **current English working-tree content**. Clean English sources record both `sourceBlob` and `sourceCommit`. English + zh-TW may land in the same commit, but a dirty English source must be staged first and the staged blob must exactly match the working-tree content. In that case `sourceBlob` records the staged object and `sourceCommit` is omitted because no commit identifies that content yet. If English changes after staging, stage it again before marking synced.
4. **Validate.** Use `pnpm docs:check` before handoff. During translation iteration, the narrower sequence `pnpm maintain-i18n:lint` → `pnpm --filter @pikacss/docs test` → `pnpm docs:build` remains useful.

## Hard Rules

- Code blocks: translate comments ONLY. Identifiers, string values, CSS output, file paths, shell commands stay byte-identical. This is stricter than MDN practice (which also translates strings/output) — do not relax it.
- Every zh heading carries the English anchor: `## 安裝 {#installation}`. The `{#id}` sequence must equal the English page's slug sequence (lint-enforced).
- Internal links → `/zh-tw/...`; links into `/api/*` and external URLs unchanged.
- When unsure whether to translate a term: keep English, use it consistently, and flag it for glossary addition.
- Never edit `docs/api/*.md` (generated) or English source pages.
- Never invent content absent from the English source; zh-TW is a mirror, not an editorial fork.
- A translated body does not mean a synced page. `--mark-synced` is the explicit assertion that the zh-TW body matches the current English blob; never run it merely to silence freshness output. For same-commit English + zh-TW changes, stage the final English content first. The command refuses dirty English whose index blob differs from the working tree, preventing provenance from pointing at a local dangling object that clones cannot retrieve. `sourceCommit` is intentionally omitted until that staged blob is committed.
- If a body was updated but `--mark-synced` was skipped, freshness remains stale even when the prose happens to be current. This has happened before (`available-hooks.md` and `create-a-plugin.md` during #116), so always verify the provenance block as a separate step.

## Fallback Rules (full-retranslate instead of hunk-level sync)

The status script decides per page; the agent follows the task file. Full retranslation when ANY of:
- changed-line ratio `(added + deleted) / current-total` > 0.6
- English file renamed with git similarity < 50% (treated as delete + new page)
- heading-id sequence LCS against the recorded source < 0.7 (section reordering — hunk mapping unreliable)
- recorded `sourceBlob` unretrievable (`git cat-file` fails) and `sourceCommit` unknown

## Runtime State

`.maintain-i18n/` (gitignored) holds ephemeral task files only. Durable sync state lives in each zh page's `translation:` frontmatter — committed, reviewed in PRs, survives clones.
