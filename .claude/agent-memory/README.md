# Reviewer memory

The three reviewers in `.claude/agents/` declare `memory: project`, so each writes
its accumulated lessons to `.claude/agent-memory/<agent-name>/`.

This directory is committed on purpose. A reviewer that learns "this repository
keeps forgetting X" is only useful if the next session, and the next machine,
starts with that knowledge. Machine-local notes belong in
`.claude/agent-memory-local/`, which is gitignored.

Treat the contents as reviewer notes, not as rules:

- Rules that must always apply belong in `AGENTS.md`.
- Rules that must be enforced belong in `.claude/settings.json`, `.github/CODEOWNERS`,
  or a CI gate. Memory is context, never enforcement.
- A note that turns out to be wrong should be deleted rather than argued with.
