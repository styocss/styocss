---
name: review-pr
description: Review a pull request with this repository's fresh-context reviewers and post one structured verdict comment. Use for any pull request before merging it, and especially for pull requests whose author has not read AGENTS.md.
argument-hint: "[pr-number]"
disable-model-invocation: true
allowed-tools: Bash(gh pr view:*) Bash(gh pr diff:*) Bash(gh pr checkout:*) Bash(gh pr comment:*) Bash(git diff:*) Bash(git log:*) Bash(git status:*) Read Grep Glob
---

# Review pull request $ARGUMENTS

CI has no LLM reviewer, so this is where the rules that cannot be scripted get checked. Your job is to produce one comment the owner can act on in under a minute, and nothing else.

**You do not fix, push, or merge.** Findings go in the comment; the owner decides.

## 1. Read before you run

```bash
gh pr view $ARGUMENTS --json title,author,baseRefName,headRefName,files,labels,body
gh pr diff $ARGUMENTS
```

Assume the author has not read AGENTS.md. Read the whole diff before executing anything from the branch.

**Do not run `pnpm install` if the pull request touches `package.json`, `pnpm-lock.yaml`, or `pnpm-workspace.yaml`.** Installing executes dependency lifecycle scripts from a manifest you did not write, and this repository's supply-chain policy (`minimumReleaseAge`, `trustPolicy: no-downgrade`, security `overrides`) is exactly what such a change could quietly relax. Review those hunks statically and put them under Owner decision.

If the diff is otherwise clean and you need to run tests, `gh pr checkout $ARGUMENTS` first.

## 2. Dispatch the reviewers that apply

Run them in parallel, one message, based on what the diff touches:

| Touched | Reviewer |
|---|---|
| `packages/*/src/**` | `engine-review` |
| test files, coverage config | `maintain-tests-review` |
| `docs/**`, any `README.md`, `docs/.examples/**` | `maintain-docs-review` |
| `docs/zh-tw/**` | invoke the `maintain-i18n` skill yourself — there is no reviewer for it |

Give each reviewer the PR number, the file list in its scope, and the base ref. They read the repository themselves; do not paste the diff into their prompt.

Nothing in scope means say so and stop — do not invent a review.

## 3. Check what no reviewer owns

- CI status: `gh pr view $ARGUMENTS --json statusCheckRollup`. A red gate is the answer; do not re-derive it by hand.
- Scope: does the diff do only what the title and body claim? Name the hunks that do not.
- Supply chain: any new dependency, or any loosening of `pnpm-workspace.yaml` policy.
- Public surface: `packages/*/package.json` `exports`, `engines`, `files`, and exported type shapes.

## 4. Post exactly one comment

```bash
gh pr comment $ARGUMENTS --body "<your verdict>"
```

Structure it as:

- **Verdict** — one line: ready to merge, ready with notes, or changes needed.
- **Blocking** — each finding as `file:line — what is wrong — the fix`. Empty is fine; say so.
- **Owner decision** — breaking changes, new dependencies, coverage exceptions, public-contract changes, anything the reviewers escalated. Empty is fine; say so.
- **Checked** — which reviewers ran, which commands you ran, and what you did not check.

Say plainly what you did not verify. A review that hides its gaps is worse than a short one.
