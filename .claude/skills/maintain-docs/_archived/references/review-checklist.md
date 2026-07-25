# Docs Review Checklist

Use this checklist for review findings after implementation. Canonical low-level rules live in `writing-conventions.md`, `example-authoring.md`, `content-policies.md`, and `route-linking.md`.

## Metadata

- Confirm every docs page has the required frontmatter fields: `relatedPackages`, `relatedSources`, `category`, `order`.
- Confirm `category` uses a valid value from the IA table.
- Confirm `relatedSources` paths exist in the workspace and point to the correct source files.
- Confirm `relatedPackages` contain valid npm package names from this workspace.
- Confirm frontmatter and internal links follow `writing-conventions.md`.

## Source Association

- Confirm each page's `relatedSources` accurately reflects the source files it documents.
- Flag pages whose content references APIs or behaviors from source files not listed in `relatedSources`.
- Flag stale associations pointing to renamed, moved, or deleted source files.

## Example Conventions

- Confirm example authoring follows `example-authoring.md`.
- Confirm all example tests pass.

## API Reference

- Confirm API reference ownership follows `content-policies.md`.
- Confirm API Reference content matches current JSDoc and export signatures.

## Nav/Sidebar

- Confirm nav/sidebar configuration in `docs/.vitepress/config.ts` includes all docs pages.
- Confirm ordering matches frontmatter `order` values.
- Confirm no orphan pages exist (pages in the directory but missing from nav/sidebar).

## Package READMEs

- Confirm each package README follows the convention: Description + Install + Basic Usage + Link to docs.
- Confirm usage examples are accurate and reflect current API.
- Confirm docs site links point to existing pages.

## Content Quality

- Confirm technical accuracy: API names, parameter types, return values, and behavior descriptions match source code.
- Confirm code examples compile and demonstrate the intended behavior.
- Confirm no placeholder or stub content remains in published pages.
- Confirm prose is clear, concise, and appropriate for the target audience.
- Confirm Learn pages establish a mental model, not just a list of package or feature bullets.
- Confirm instructional pages name common pitfalls or likely failure modes explicitly.

## Writing Conventions

- Confirm prose, headings, and `## Next` behavior follow `writing-conventions.md`.
- Confirm route-local versus cross-route progression follows `route-linking.md`.
- Confirm VitePress syntax usage follows `markdown-authoring.md`.

## Brief Contract

- Confirm page briefs contain `Mental model`, `Validation`, `Common pitfalls`, and `Required API links`.
- Confirm high-priority page briefs match `implementation-spec.md` before large rewrites start.

## Help And Skills

- Confirm `skills/index.md` only describes the public user-facing skills.
- Confirm public Skills pages do not route readers into internal repository-only workflows.

## i18n (when reviewing translate-docs changes)

- Confirm zh-TW directory structure mirrors English structure exactly.
- Confirm zh-TW frontmatter field values match English counterparts (except translated `title`/`description`).
- Confirm zh-TW examples are copied from English with only comments and descriptive strings translated.
- Confirm code identifiers, API names, and package names are not translated.
- Confirm `.pikaout.css` files are identical between English and zh-TW.
- Confirm zh-TW example tests pass.

## VitePress Build

- Confirm `pnpm --filter @pikacss/docs build` passes without errors (includes broken link detection).
