# @pikacss/plugin-design-tokens

Design tokens plugin for PikaCSS. Converts W3C Design Tokens (JSON files, inline objects, or `design.md` documents) into CSS variables through the engine's `variables` system.

## Installation

```bash
pnpm add -D @pikacss/plugin-design-tokens
```

## Usage

The example below assumes the application already uses `@pikacss/unplugin-pikacss`; Nuxt applications can import the same `defineConfig` surface from `@pikacss/nuxt-pikacss`.

```ts
import { designTokens } from '@pikacss/plugin-design-tokens/node'
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  engine: {
    plugins: [designTokens()],
    designTokens: {
      sources: ['./design.md'],
      themes: {
        dark: { selector: '.dark' },
      },
    },
  },
})
```

The package root is platform-neutral and supports inline token objects or a custom `readFile` capability. File-backed JSON and Markdown sources use the `/node` adapter shown above. Reference the generated variables from regular `pika()` calls (`color: 'var(--color-primary)'`); unused tokens are pruned by default.

## Features

- **DTCG ingestion** — `$ref` JSON pointers resolved to aliases, group-level `$type` and `$deprecated` inheritance, and `$extensions` carry-through.
- **External aliases** — mark a token with `$extensions["com.pikacss.design-tokens"] = { external: true, var: '--custom-property' }` to reference a design system's own runtime CSS variables; emitted under `:root` only, never themed.
- **Per-source prefix and layer** — pass `{ source, prefix?, layer? }` entries to namespace or tag (`primitive` / `semantic`) individual sources.
- **Themes** — base tokens under `:root`, theme tokens under a selector (default `.<themeName>`); a single shared file can back multiple themes via `from` partition selection and `media` dual emission.
- **Autocomplete** — a built-in `$type` → CSS-property map suggests each variable where it belongs; override per `$type` with `typeAutocomplete`.
- **Strict mode** — govern which literal values are allowed on token-governed properties (`level`, per-key `overrides`, `allowedValues`, `semanticOnly`), with optional compile-time `types` narrowing in `pika.gen.ts`. Violations are delivered through the engine's `onDiagnostic` handler (`{ level, code, message, plugin: 'design-tokens' }`); the bundler integration collects error-level diagnostics to fail the build.
- **Extension seam** — `loaders` (custom file formats) and `normalizers` (ordered transform chain) plug into ingestion without changing built-in behavior.
- **Usage report** — `engine.designTokens.report()` summarizes used/unused/deprecated tokens and cumulative strict-violation counts.

## Documentation

See the [full documentation](https://pikacss.github.io/official-plugins/design-tokens).

## License

MIT
