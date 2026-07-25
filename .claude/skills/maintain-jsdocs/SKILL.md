---
name: maintain-jsdocs
description: 'Orchestrate PikaCSS codebase-wide JSDoc maintenance with a scaffold-and-fill workflow. Use when: (1) filling or improving JSDoc across all exported declarations, (2) running whole-repo or targeted JSDoc maintenance, (3) ensuring gen-api-docs produces zero coverage gaps. The workflow scaffolds JSDoc templates with @todo FILL markers via TypeScript AST on every exported declaration (including @internal), then the executing agent fills them iteratively.'
---

# Maintain JSDocs

## Scope boundary

- Authoritative workflow for JSDoc maintenance in PikaCSS.
- JSDoc-only. README and docs edits are out of scope unless the user explicitly broadens the request.
- Targets **all exported declarations** across all source files in each package, not just the public API surface from `index.ts`.
- Includes `@internal` exports — the scaffold preserves existing `@internal` tags in generated templates so gen-api-docs skips them, but the JSDoc content is still maintained.
- Also covers module augmentation members in plugin packages.
- Keep all JSDoc content in English.

## Workflow

```
select packages → scaffold → fill loop → validate
```

| Step | What happens | Who |
|------|-------------|-----|
| **Select packages** | Multi-select packages to process via `vscode_askQuestions` | Executing agent + User |
| **Scaffold** | TypeScript AST replaces all JSDoc with templates containing `@todo FILL:` markers | Runtime script |
| **Fill loop** | Grep for `@todo FILL`, read each file, fill JSDoc content, remove markers | Executing agent (LLM) |
| **Validate** | Run JSDoc lint for corruption check + gen-api-docs for zero-gap check + package typecheck | Executing agent |

The scaffold script handles all the mechanical work (stripping old JSDoc, inserting templates with the right structure and tags). The LLM focuses purely on writing semantic content by filling in the `@todo FILL:` placeholders.

## Runtime surface

Entrypoint: `pnpm maintain-jsdocs:scaffold --packages <name>...`

| Command | Purpose |
|---------|---------|
| `pnpm maintain-jsdocs:scaffold --packages <name>...` | Replace/insert JSDoc templates with `@todo FILL:` markers on all exported declarations (including `@internal`) |
| `pnpm maintain-jsdocs:lint [--packages <name>...]` | Detect LLM fill-step corruption: literal `\n`/`\t`, collapsed lines, unfilled `@todo`, merged tags |

Validation: `pnpm maintain-docs:gen-api` + `pnpm maintain-jsdocs:lint`

## Exclusions

- `dist/`, `coverage/`, generated outputs
- `*.test.ts`, `*.spec.ts`
- `pika.gen.ts`, `pika.gen.css`
- `generated-*.ts`

## Execution guide

### Step 0: Select packages

Use `vscode_askQuestions` to present a multi-select list of packages:

```
header: "JSDoc scope"
question: "Which packages should be scaffolded for JSDoc maintenance?"
multiSelect: true
options:
  - label: "@pikacss/core"
  - label: "@pikacss/integration"
  - label: "@pikacss/unplugin-pikacss"
  - label: "@pikacss/nuxt-pikacss"
  - label: "@pikacss/plugin-reset"
  - label: "@pikacss/plugin-icons"
  - label: "@pikacss/plugin-fonts"
  - label: "@pikacss/plugin-typography"
  - label: "@pikacss/eslint-config"
```

Map the user's selections to package directory names (e.g. `@pikacss/core` → `core`, `@pikacss/unplugin-pikacss` → `unplugin`).

### Step 1: Scaffold

```bash
pnpm maintain-jsdocs:scaffold --packages core integration
```

The scaffold script:
1. Uses the TypeScript compiler API to walk **all source files** in each package's `src/` directory (not just the `index.ts` entry point).
2. Finds every exported declaration (functions, interfaces, types, constants, classes) and module augmentation members.
3. For each symbol, generates a JSDoc template with `@todo FILL:` markers appropriate to its kind (function params, interface members, class public properties/methods/constructors, optional property defaults, type params, remarks, examples, etc.).
4. Preserves existing `@internal` tags — symbols that were `@internal` get `@internal` in their generated template.
5. **Aggressively replaces** any existing JSDoc with the template — this is a clean-restart strategy.
6. Inserts templates where no JSDoc exists.
7. Reports: files modified, total `@todo` markers inserted.

#### Template examples

Function:
```ts
/**
 * @todo FILL: describe createEngine
 *
 * @param config - @todo FILL: describe config
 * @returns @todo FILL: return value
 */
```

Interface member (optional property):
```ts
  /**
   * @todo FILL: describe plugins
   *
   * @default @todo FILL: default
   */
  plugins?: EnginePlugin[]
```

### Step 2: Fill loop

Process files **one at a time** until no `@todo FILL` markers remain:

1. **Search**: Use grep to find files containing `@todo FILL` in the target packages' `src/` directories.
   ```
   grep -rn "@todo FILL" packages/{core,integration}/src/
   ```
2. **Process**: For each file with markers:
   - Read the full file.
   - For every `@todo FILL: <hint>` marker, read the surrounding code to understand the symbol's purpose, implementation, type relationships, and usage patterns.
   - Replace each `@todo FILL: <hint>` with complete JSDoc content following the [Quality guide](#quality-guide).
   - Remove the `@todo` tag entirely — the filled content stays, the tag goes.
   - Write the file back.
3. **Repeat**: Search again. Continue until zero `@todo FILL` matches remain.

#### Fill rules

- When filling a `@todo FILL: describe <name>` that serves as the JSDoc summary, write the summary text directly (no tag prefix needed — it becomes the first line of the JSDoc block).
- When filling `@param <name> - @todo FILL: describe <name>`, replace only the `@todo FILL: describe <name>` portion with the actual parameter description.
- When filling `@returns @todo FILL: return value`, replace `@todo FILL: return value` with the actual return description.
- When filling `@default @todo FILL: default`, replace `@todo FILL: default` with the actual default value.
- Add `@remarks`, `@example`, `@typeParam` tags as needed — the template provides the minimum structure, the LLM can enrich beyond it.

#### Fill anti-patterns

**Never** produce replacements that contain literal `\n`, `\t`, or `\r` strings inside JSDoc. Each JSDoc tag and line must be a real line in the file, properly prefixed with ` * `. When adding multi-line content (e.g. `@remarks` followed by `@example`), write each section on its own line — do not collapse them into a single line with escape characters.

### Step 3: Validate

```bash
# Lint JSDoc for LLM fill-step corruption — goal is "✅ No JSDoc lint issues detected."
pnpm maintain-jsdocs:lint --packages <package>...

# Check JSDoc coverage — goal is "✅ No JSDoc coverage gaps detected."
pnpm maintain-docs:gen-api

# Package-scoped typecheck for each touched package
pnpm --filter @pikacss/<package> typecheck
```

If the lint reports issues (literal escape sequences, collapsed lines, unfilled todos, merged tags), fix them before proceeding to gen-api-docs.

If gen-api-docs reports remaining gaps, return to Step 2 for those specific symbols.

After both lint and gen-api-docs pass, produce a summary report for the user: packages processed, files modified, quality observations.

## Quality guide {#quality-guide}

gen-api-docs uses the TypeScript compiler API to extract JSDoc from `packages/*/src/index.ts` entry points. Every coverage gap means the generated API reference page shows "Missing JSDoc summary." to readers.

### Zero-gap requirements

Every non-`@internal` export must satisfy:

| Export kind | Required |
|-------------|----------|
| Function | Summary + `@param` with description for each parameter |
| Interface | Summary + description for every property member |
| Type alias | Summary |
| Constant / Variable | Summary |
| Class | Summary + description for every public property and method (including parameters) |
| Module augmentation member | Description for each property |

### High-density JSDoc standard

Beyond zero-gap, every JSDoc block should be semantically rich:

- **`@param`** — Explain what the parameter controls, not just its type. Include constraints, defaults when omitted, and impact on behavior.
- **`@returns`** — What the return value represents and any guarantees about its state.
- **`@typeParam`** — For generic parameters: what they represent and important constraints.
- **`@remarks`** — Usage context, lifecycle notes, cross-module relationships, performance considerations.
- **`@example`** — Required when usage is non-obvious, ordering-sensitive, composable, or easy to misuse. Use fenced TypeScript code blocks.
- **`@default`** — For optional interface properties: the effective default value or behavior when omitted. Use inline code for literal values.
- **Class members** — Public properties need summary descriptions. Public methods follow the same `@param`/`@returns`/`@remarks` standard as top-level functions. Constructors need `@param` descriptions.

### Writing principles

- **Explain intent, not syntax.** "Returns the resolved engine configuration after plugin normalization" beats "Returns a ResolvedEngineConfig object".
- **Be concrete.** Cover: purpose, when to use, constraints, defaults, side effects, edge cases.
- **No filler.** Every sentence must add information beyond what the type signature already conveys. Avoid "Defines the X" or "Represents a Y" without semantic follow-up.
- **Options interfaces**: document every field's purpose, default behavior, and impact on the system.
- **Factory functions** (`create*`, `define*`): explain what gets created, prerequisites, and how to use the result.
- **Plugin variables**: describe what the plugin does, which hooks it uses, and visible engine side effects.
- **Type aliases**: explain the semantic meaning and when a consumer encounters or produces this type.
- **Utility types**: explain the type-level transformation and provide a concrete usage example.

### JSDoc format conventions

Write standard JSDoc with `/**` and `*/` delimiters. Ensure proper indentation matching the surrounding code.

**Function example:**
```ts
/**
 * Creates a new engine instance with the given configuration.
 *
 * Initializes the plugin pipeline, resolves layer ordering, and prepares
 * the atomic style registry. Call this once per application context.
 *
 * @param config - Engine configuration including plugins, layers, and preflight settings. When omitted, creates a minimal engine with no plugins.
 * @returns A fully initialized Engine ready to process style definitions.
 *
 * @example
 * ```ts
 * const engine = createEngine({ plugins: [resetPlugin()] })
 * ```
 */
```

**Interface example:**
```ts
/**
 * Configuration options for the PikaCSS engine.
 *
 * Controls plugin registration, layer ordering, selector defaults,
 * and preflight behavior for the atomic CSS generation pipeline.
 */
export interface EngineConfig {
  /**
   * Plugins to register with the engine, processed in order.
   *
   * @default []
   */
  plugins?: EnginePlugin[]
}
```

**Module augmentation member example:**
```ts
declare module '@pikacss/core' {
  interface EngineConfig {
    /**
     * CSS reset style to apply as a preflight.
     * Controls which reset stylesheet is injected before utility styles.
     *
     * @default 'tailwind-preflight'
     */
    reset?: ResetStyle
  }
}
```

## References

- **[Quality Standards](references/workflow-rules.md)** — Detailed JSDoc format conventions, gen-api-docs alignment rules, and quality checklist.
- **gen-api-docs source**: `scripts/maintain-docs/gen-api-docs.ts` — the authoritative consumer of JSDoc. Read its `collectCoverageGaps` function to understand exactly what gets flagged.

## Agent pairing

- The main agent or the `maintain-jsdocs` implementation agent can execute this workflow directly.
- For large scopes (>5 packages), prefer delegating to the `maintain-jsdocs` agent to keep the main conversation focused.
