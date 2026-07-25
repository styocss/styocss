# Writing Conventions

Use this reference for page metadata, prose style, internal links, and page endings. Use [markdown-authoring.md](./markdown-authoring.md) for VitePress syntax details and [example-authoring.md](./example-authoring.md) for docs example rules.

## Frontmatter

Every page except the home page must include the PikaCSS custom frontmatter fields:

```yaml
---
relatedPackages:
  - '@pikacss/core'
relatedSources:
  - 'packages/core/src/engine.ts'
category: guide
order: 10
---
```

VitePress built-in frontmatter options are also available: `title`, `titleTemplate`, `description`, `head`, `layout` (`doc` | `home` | `page`), `outline`, `sidebar`, `navbar`, `aside`, `lastUpdated`, `editLink`, `footer`, and `pageClass`.

- `description` should stay concise because `llms.txt` and search surfaces may read it out of context.
- `category` must match the owning section from [information-architecture.md](./information-architecture.md).
- `relatedSources` should stay aligned with the real source of truth when files are renamed, moved, or split.

## Writing style

- Use clear, direct language and address the reader as "you".
- Keep paragraphs short and use lists or tables when the structure is clearer than prose.
- Start each page with a one-sentence summary of what it covers.
- Use `##` for major sections and `###` for subsections. Never skip heading levels.
- Keep headings concise and descriptive in sentence case.
- Prefer active voice and avoid filler phrasing.
- Use PikaCSS terms consistently. Do not introduce alternate names for engine concepts.

## Internal links

- Use absolute internal links such as `[Installation](/getting-started/installation)`.
- Never use relative Markdown links such as `../guide/config.md`.
- For cross-locale links from zh-TW pages, use the `/zh-TW/` prefix.
- Link to headings with anchors when needed.
- Follow [route-linking.md](./route-linking.md) when choosing route-local versus cross-route links.

## LLM-friendly authoring

This site uses `vitepress-plugin-llms`, which generates `llms.txt` and `llms-full.txt` from the VitePress build:

- Page intros and `##`/`###` headings should remain self-contained and descriptive.
- Use `<llm-only>` only for short LLM-facing steering text.
- Use `<llm-exclude>` only to remove human-only noise.
- Never hide canonical constraints, warnings, examples, or route guidance in LLM-only structures.
- Preserve the same `<llm-only>` and `<llm-exclude>` structure when mirroring English pages into `docs/zh-TW/`.

## Page endings

Every page must end with a `## Next` section.

- `## Next` should normally contain 2-4 links.
- At least one `## Next` link should stay within the current route unless the page is intentionally terminal.
- Cross-route links in `## Next` should stay explicit and limited.
- Generated API pages still need route ownership, description, and `## Next` behavior that matches the owning brief.

Use [route-linking.md](./route-linking.md) for the detailed progression rules that decide which links belong in `## Next`.

## Handoff references

- Use [markdown-authoring.md](./markdown-authoring.md) for VitePress containers, code groups, imports, includes, and Vue-in-Markdown behavior.
- Use [example-authoring.md](./example-authoring.md) for example file structure, `pikain`/`pikaout`, and example validation.
