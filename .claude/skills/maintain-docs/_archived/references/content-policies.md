# Content Policies

Use this reference for ownership boundaries, source associations, generated content, and package README expectations. Use [writing-conventions.md](./writing-conventions.md) for page formatting rules and [example-authoring.md](./example-authoring.md) for example mechanics.

## Source association and drift detection

The runtime uses a two-stage process:

1. Git hash screening compares source file commit hashes against the last verified commit stored in runtime state.
2. Content analysis checks changed files to confirm whether the drift is documentation-relevant.

Each docs page declares its related sources via `relatedPackages` and `relatedSources`. The runtime `buildSourceMap()` function builds the bidirectional association between pages and source files.

- Preserve and correct source associations when a page changes.
- If documented source files were renamed, moved, or split, update `relatedSources` in the same pass.
- Treat stale source associations as documentation drift.

## API reference ownership

- `docs/api/index.md` and `docs/zh-TW/api/index.md` are hand-authored overview pages.
- Package-level API pages under `docs/api/*.md`, other than `index.md`, are generator-owned and must reflect current exports and JSDoc.
- Package-level API pages under `docs/zh-TW/api/*.md`, other than `index.md`, are also generator-owned and mirror the English package pages.
- Generated package pages must carry a generated marker and must not be manually edited.
- The generator must emit one page per published package.
- When JSDoc is incomplete, the generator should report missing symbol coverage explicitly rather than silently omitting symbols or inventing prose.
- API reference accuracy is verified against current exports and JSDoc before pages are marked as verified.

## Manual docs ownership

- Guide, configuration, troubleshooting, skills, and other non-API pages are written and maintained by the agent.
- Drift reports, source inspection, and JSDoc are reference inputs for those pages, not generator-owned prose.
- JSDoc is authoritative for API pages only, not for guide pages.
- Learn pages should not collapse into short package summaries; they must satisfy the instructional depth expectations from [implementation-spec.md](./implementation-spec.md).

## Selector documentation policy

- When selector docs explain `$`, document it as the current `defaultSelector`, not as the generated atomic class id by itself.
- When selector docs explain nested selector behavior, describe it as selector-level assembly that can render as nested CSS blocks. Do not describe it as simple string concatenation unless the source behavior changes.

## Handoff references

- Use [writing-conventions.md](./writing-conventions.md) for frontmatter, link style, LLM-facing structure, and `## Next` behavior.
- Use [example-authoring.md](./example-authoring.md) for inline-code restrictions, example file layout, and example validation.

## Package README conventions

Each package README follows this structure:

```markdown
# @pikacss/<name>

<one-line description>

## Installation

<package manager install commands>

## Usage

<minimal working example>

## Documentation

See the [full documentation](/guide/plugins/<name>).

## License

MIT
```

When a package's public API or behavior changes, update the affected `packages/*/README.md`. Ensure the usage example still compiles and stays accurate.
