---
name: maintain-jsdocs
description: 'Maintain JSDoc on exported declarations so the generated API reference has zero coverage gaps. Use when: (1) filling or improving JSDoc for exports, (2) running whole-repo or targeted JSDoc maintenance, (3) making gen-api-docs report zero gaps.'
---

# Maintain JSDocs

## Scope

- JSDoc only. README and docs pages are out of scope unless the request says otherwise.
- Covers **all exported declarations** in every source file of a package, not just what `index.ts` re-exports, plus module augmentation members in plugin packages.
- Includes `@internal` exports: gen-api skips them, but their JSDoc is still maintained.
- Excludes `dist/`, `coverage/`, `*.test.ts`, `*.spec.ts`, `pika.gen.*`, `generated-*.ts`.
- English only.

Package directories in this repository: !`grep -o "dir: '[^']*'" "${CLAUDE_PROJECT_DIR}/scripts/_skill-shared/index.ts" | sed "s/dir: //;s/'//g" | tr '\n' ' '`

Ask which packages to process when the request does not say; use `AskUserQuestion` if it is available.

## The contract

`gen-api-docs` extracts JSDoc from `packages/*/src/index.ts` via the TypeScript compiler API. Every gap renders as "Missing JSDoc summary." on a published page, so the gap list is the definition of done:

| Export kind | Required |
|---|---|
| Function | Summary + `@param` description per parameter |
| Interface | Summary + description per property |
| Type alias | Summary |
| Constant / Variable | Summary |
| Class | Summary + description per public property and method, including constructor `@param`s |
| Module augmentation member | Description per property |

`collectCoverageGaps` in `scripts/maintain-docs/gen-api-docs.ts` is the authority. Read it when a gap report is surprising.

## Workflow

1. **Find the gaps.** `pnpm maintain-docs:gen-api` lists every coverage gap by package and symbol. Work from that list.
2. **Write the JSDoc** directly in the source file, reading the implementation and its call sites first.
3. **Validate**:

```bash
pnpm maintain-jsdocs:lint --packages <name>...   # corruption check
pnpm maintain-docs:gen-api                       # zero-gap check
pnpm --filter @pikacss/<name> typecheck
```

Repeat until gen-api reports `✅ No JSDoc coverage gaps detected.`

For large scopes, process one package per subagent in parallel rather than sweeping serially.

### Full restart (opt in, destructive)

`pnpm maintain-jsdocs:scaffold --packages <name>...` **replaces** existing JSDoc on every exported declaration with `@todo FILL:` templates, then you fill each marker and remove the tag.

Use it only when the existing JSDoc for a package is being rewritten wholesale on purpose. It discards good prose along with bad, so gap-driven editing is the default.

## Quality bar

Beyond zero-gap: every sentence must add something the type signature does not already say. "Returns the resolved engine configuration after plugin normalization" over "Returns a ResolvedEngineConfig".

Repo-specific conventions the generator and readers rely on:

- `@default` on every optional interface property — the effective value or behavior when omitted, literals in inline code.
- `@example` with a fenced `ts` block when usage is ordering-sensitive, composable, or easy to misuse.
- `@remarks` for lifecycle, hook interaction, and cross-package relationships — this is where PikaCSS's non-obvious behavior belongs.
- Each JSDoc tag starts its own real line. Never emit literal `\n` or `\t` inside a comment; `maintain-jsdocs:lint` fails on both.

```ts
declare module '@pikacss/core' {
  interface EngineConfig {
    /**
     * CSS reset style injected as a preflight, before utility styles.
     *
     * @default 'tailwind-preflight'
     */
    reset?: ResetStyle
  }
}
```

## References

- [workflow-rules.md](references/workflow-rules.md) — format conventions and the quality checklist.
