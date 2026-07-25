# Quality Standards Reference

Detailed rules for the maintain-jsdocs workflow. Read when filling JSDoc or reviewing quality.

## Table of Contents

- [gen-api-docs Alignment](#gen-api-docs-alignment)
- [JSDoc Format Conventions](#jsdoc-format-conventions)
- [Quality Checklist](#quality-checklist)
- [Package Processing Order](#package-processing-order)

## gen-api-docs Alignment

gen-api-docs determines coverage gaps through the `collectCoverageGaps` function. The scan runtime uses the same TypeScript compiler API logic, ensuring scan results match gen-api-docs exactly.

### What gen-api-docs checks

For each non-`@internal` export from `packages/*/src/index.ts`:

| Export kind | Gap triggers |
|-------------|-------------|
| Function | Missing summary description, missing `@param` description for any parameter |
| Interface | Missing summary description, missing description for any property member |
| Type alias | Missing summary description |
| Constant / variable | Missing summary description |
| Class | Missing summary description |

For module augmentations (`declare module '...' { interface ... }`):
- Missing description for any property member

### How gen-api-docs extracts JSDoc

- Uses `ts.Symbol.getDocumentationComment()` for summary descriptions
- Uses `@param` tags matched by parameter name for function parameter descriptions
- Uses `ts.Symbol.getDocumentationComment()` on each interface property for member descriptions
- Normalizes `{@link ...}` tags by extracting the label (or the target if no label)
- Skips exports tagged with `@internal`

### Common pitfalls

- **Re-exports**: gen-api-docs filters by `isOwnDeclaration` — only declarations in the package's own `packages/<dir>/` directory qualify. JSDoc on re-exported symbols must live in the original source.
- **`{@link}` duplication**: The normalizer strips `{@link Foo}` to just `Foo`, which can cause doubled text like `Engine.useuse`. Avoid `{@link}` in summary lines; use backtick references instead.
- **Module augmentation members**: These are extracted from all source files under `packages/<dir>/src/`, not just the entry `index.ts`. This correctly discovers augmentations defined in plugin sub-modules (e.g. `core/src/internal/plugins/variables.ts`). JSDoc must be on the property in the `declare module` block.

## JSDoc Format Conventions

### Structure

```
/**
 * <summary line — concise statement of purpose>
 *
 * <optional elaboration paragraph(s)>
 *
 * @param <name> - <description>
 * @returns <description>
 * @typeParam <name> - <description>
 * @default <value>
 * @remarks <additional context>
 *
 * @example
 * ```ts
 * <code>
 * ```
 */
```

### Tag conventions

| Tag | When to use | Format |
|-----|------------|--------|
| `@param` | Every function parameter | `@param name - Description of what it controls.` |
| `@returns` | Functions with non-void return | `@returns Description of the return value and guarantees.` |
| `@typeParam` | Generic type parameters | `@typeParam T - What this type parameter represents.` |
| `@default` | Optional interface properties with a default | `@default value` (use backtick code for complex values) |
| `@remarks` | Additional context beyond summary | Free-form paragraph(s) |
| `@example` | Non-obvious usage | Fenced TypeScript code block |
| `@internal` | Internal-only exports | Just the tag, no text needed |

### Indentation

Match the surrounding code's indentation. For interface members inside 2-space indented code:

```ts
export interface Foo {
  /**
   * Description of bar.
   *
   * @default 'baz'
   */
  bar?: string
}
```

## Quality Checklist

Use this checklist when reviewing JSDoc quality after the fill step.

### Coverage check
- [ ] Every non-`@internal` export has a summary description
- [ ] Every function parameter has a `@param` description
- [ ] Every interface property member has a description
- [ ] Every module augmentation member has a description

### Semantic value check
- [ ] Summary explains what the symbol does or represents, not just its TypeScript shape
- [ ] No type paraphrasing — "an array of strings" adds nothing if the type is `string[]`
- [ ] Constraints, defaults, and side effects are documented where applicable

### Completeness check
- [ ] Functions: purpose, param descriptions, return semantics, edge cases
- [ ] Options interfaces: every field's purpose and default behavior
- [ ] Plugin variables: what the plugin does, hooks it uses, config it provides
- [ ] Type aliases: semantic meaning and when consumers encounter this type
- [ ] Utility types: type-level transformation explained, with example

### Format check
- [ ] No `{@link}` in summary lines (use backtick references instead)
- [ ] `@param` uses `- ` separator after parameter name
- [ ] `@default` uses inline code for literal values
- [ ] `@example` uses fenced TypeScript code blocks
- [ ] Indentation matches surrounding code

### LLM fill-step integrity check (`pnpm maintain-jsdocs:lint`)
- [ ] No literal `\n`, `\t`, or `\r` escape sequences in JSDoc (should be actual newlines)
- [ ] No JSDoc lines exceeding 300 characters (indicates collapsed multi-line content)
- [ ] No leftover `@todo FILL` markers
- [ ] No multiple `@`-tags merged onto a single line

## Package Processing Order

Process packages from most independent to most dependent:

1. **core** — No internal dependencies. Foundation types and engine.
2. **integration** — Depends on core. Build-tool integration context.
3. **unplugin** — Depends on integration. Universal bundler plugins.
4. **nuxt** — Depends on unplugin. Nuxt module.
5. **plugin-reset** — Depends on core. CSS reset plugin.
6. **plugin-icons** — Depends on core. Icon shortcuts plugin.
7. **plugin-fonts** — Depends on core. Web font integration plugin.
8. **plugin-typography** — Depends on core. Prose typography plugin.
9. **eslint-config** — Depends on core. ESLint configuration.

This order ensures upstream JSDoc is settled before downstream symbols reference it.

## Scaffold Command

The `scaffold` command uses the TypeScript compiler API to discover all non-`@internal` exports and insert JSDoc templates with `@todo FILL:` markers.

```bash
# Scaffold specific packages
pnpm maintain-jsdocs:scaffold --packages core integration
```

### What scaffold does

- Discovers all non-`@internal` exports from `packages/*/src/index.ts` entry points
- Discovers module augmentation members from all source files in each package
- **Replaces** any existing JSDoc with a template (aggressive/clean-restart strategy)
- **Inserts** templates where no JSDoc exists
- Generates kind-appropriate templates: function params, interface members, optional property defaults
- Excludes test files (`*.test.ts`, `*.spec.ts`) and generated files (`pika.gen.*`)

### When to scaffold

- **Fresh JSDoc pass**: When performing a full JSDoc maintenance cycle on selected packages
- **Quality reset**: When existing JSDoc has systematic issues and a clean restart is more efficient
- **New package**: When a new package is added and all exports need JSDoc
