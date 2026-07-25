# Troubleshooting

- Canonical docs path: `docs/troubleshooting/index.md`
- Route group: `help`
- Section: `Troubleshooting`
- Category: `troubleshooting`
- Page kind: `troubleshooting`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Help readers diagnose what is wrong and route them to the most relevant fix path.

## Target reader

- Users whose setup, output, integration, or workflow is not behaving as expected.

## Prerequisites

- Route stage: The reader has already attempted setup, usage, or authoring and is now blocked.
- Capability: The reader can describe a concrete failure or confusion point.

## Must include

- What problem taxonomy readers should use to classify the issue.
- How readers should perform fast checks before deeper debugging.
- When readers should return to setup or feature pages because prerequisites were skipped.
- Why some issues should escalate into contribution or bug-reporting paths.

## Example requirement

- No example required; short diagnostic snippets are acceptable when they accelerate debugging.

## Must not include

- Full onboarding content.
- Long feature tutorials that belong in Learn.

## Link contract

- Incoming route-local: None.
- Incoming cross-route: Any Learn, Extend, or Reference page where users may become blocked.
- Outgoing route-local: `../contributing/index.md` and `../skills/index.md` when the reader needs escalation or guided support resources.
- Outgoing cross-route: Relevant Learn pages, Extend pages, or API Reference pages depending on where the actual fix lives.

## Source of truth

- `docs/.examples/`
- package source and config surfaces across `packages/*`
- common failure modes observed in docs and examples

## Notes

- Keep this page optimized for fast diagnosis.