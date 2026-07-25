---
name: maintenance-sweep
description: Find and fix accumulated maintenance drift — docs, translations, API reference gaps, browser data — and open one pull request per topic. Use when running the periodic maintenance pass, manually or on a schedule.
disable-model-invocation: true
allowed-tools: Bash(pnpm maintain-docs:analyze) Bash(pnpm maintain-i18n:status:*) Bash(pnpm maintain-docs:gen-api) Bash(pnpm update:browsers) Bash(gh pr list:*) Bash(gh pr create:*) Bash(git checkout:*) Bash(git switch:*) Bash(git add:*) Bash(git commit:*) Bash(git push:*) Bash(git diff:*) Bash(git status:*) Read Grep Glob Edit Write
---

# Maintenance sweep

You are operating autonomously. The owner is not watching and cannot answer questions mid-run, so asking "shall I…?" blocks the work. Proceed on anything reversible that follows from the checks below; anything else becomes a note in the pull request body, not a question.

## Hard limits

- **Three pull requests per run, maximum.** Fewer is fine. Leaving work for the next run is fine; flooding the owner is not.
- **One topic per pull request.** Never combine a translation sync with a docs rewrite.
- **Never merge.** Opening the pull request is where you stop.
- **Never touch dependency policy.** `pnpm update:browsers` is in scope; editing `pnpm-workspace.yaml`, adding dependencies, or relaxing `minimumReleaseAge`/`trustPolicy`/`overrides` is not.

## Before starting

```bash
gh pr list --state open --json number,title,headRefName
```

Skip any topic that already has an open pull request. Re-opening the same drift every run is the failure mode that makes a scheduled sweep worthless.

## Topics, in priority order

Run each check, then act only on real findings.

| Topic | Detect | Act |
|---|---|---|
| Docs drift | `pnpm maintain-docs:analyze` | Fix outdated or missing pages with the `maintain-docs` skill, then hand the result to `maintain-docs-review` before opening the pull request |
| Translation staleness | `pnpm maintain-i18n:status` | Sync the stale pages with the `maintain-i18n` skill, including the `translation:` frontmatter via `--mark-synced` |
| API reference gaps | `pnpm maintain-docs:gen-api` | If it reports JSDoc coverage gaps, fill them with the `maintain-jsdocs` skill until the run is clean. Commit the regenerated `docs/api/*.md` — never hand-edit them |
| Browser data | `pnpm update:browsers` | Commit the lockfile and any regenerated `packages/core/src/generated/*` from `pnpm generate:core:css`. This one touches `pnpm-lock.yaml`, so it always needs the owner |

`pnpm maintain-jsdocs:lint` is knowingly broken — it reports hundreds of false positives on legitimate long `@remarks` prose. Do not run it and do not act on it.

## Per pull request

Branch as `chore/maintenance-<topic>`, title as `chore(maintenance): <topic>`, and a body with four sections:

- **What changed** and why the check flagged it.
- **Evidence** — the commands you ran and their observed output. Only claims you can point at.
- **Needs your decision** — anything you deliberately left alone.
- **Risk** — what could break, or "none, generated output only".

Then verify: the touched area's own validation (`pnpm lint`, the relevant `pnpm --filter <pkg> test`, `pnpm maintain-i18n:lint`) before pushing. A red pull request costs the owner more than a missing one.

## Finishing

End with a summary of every topic checked, what you opened, and what you deliberately deferred. If nothing drifted, say that plainly — a clean sweep with no pull requests is a successful run.

## Scheduling

Runs locally under the owner's own credentials, so no repository secret is involved:

```bash
# weekly, Monday 09:00 — the machine must be awake
0 9 * * 1 cd /path/to/pikacss && claude -p "/maintenance-sweep" >> /tmp/pikacss-sweep.log 2>&1
```

Use a shell cron, not Claude Code's own scheduled tasks: `disable-model-invocation: true` above also stops a scheduled task from firing this skill as its prompt. Passing it as the prompt to `claude -p` counts as an owner invocation and works. Drop the flag only if you decide you want Claude to reach for this sweep on its own.
