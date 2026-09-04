# Plugin: Fonts

> Read this when the user asks about web-font providers, Google/Bunny/Fontshare/Coollabs loading, custom providers, self-hosted `@font-face`, raw imports, family stacks, or `font-*` shortcuts.

## Installation and Setup

```bash
pnpm add -D @pikacss/plugin-fonts
```

```ts
// pika.config.ts
import { defineConfig } from '@pikacss/unplugin-pikacss'
import { fonts } from '@pikacss/plugin-fonts'

export default defineConfig({
  engine: {
  plugins: [fonts()],
  },
})
```

`fonts()` takes no arguments. Configure it through the top-level `fonts` key.

## Generated Shortcuts

Every token under `fonts.fonts` or `fonts.families` creates a `font-{token}` shortcut backed by a `--pk-font-{token}` variable:

```ts
pika('font-sans')
pika('font-display', { fontWeight: '700' })
```

## Provider Fonts

The default provider is `google`:

```ts
export default defineConfig({
  engine: {
  plugins: [fonts()],
  fonts: {
    provider: 'google',
    display: 'swap',
    fonts: {
      sans: 'Inter:400,600,700',
      display: {
        name: 'Playfair Display',
        weights: [400, 700],
        italic: true,
      },
      mono: [
        { name: 'JetBrains Mono', weights: [400, 700] },
        'ui-monospace',
      ],
    },
  },
  },
})
```

A token may map to one font entry or an array. Array entries are combined into the final family stack.

### Built-in providers

| Provider | Purpose |
|---|---|
| `google` | Google Fonts; resolved through `unifont` at build time; default |
| `bunny` | Bunny Fonts; resolved through `unifont` at build time |
| `fontshare` | Fontshare; resolved through `unifont` at build time |
| `coollabs` | Coollabs Google Fonts proxy; stylesheet import path |
| `none` | No external request; useful for generic or already-loaded family names |

A per-font `provider` overrides the global provider. Google, Bunny, and Fontshare are converted to concrete `@font-face` rules during engine initialization. If `unifont` cannot resolve a family, that entry falls back to the legacy stylesheet import and emits `fonts-provider-resolution-failed` when the failure is an exception. Coollabs and custom providers always use the stylesheet path. An explicit custom provider registered under a built-in name (for example `providers.google`) overrides the `unifont` integration entirely.

### Font entry forms

```ts
fonts: {
  fonts: {
    simple: 'Roboto',
    weighted: 'Roboto:400,700',
    variable: 'Roboto Flex:100..900',
    detailed: {
      name: 'Roboto',
      weights: [400, 700],
      italic: true,
      provider: 'bunny',
      providerOptions: {
        text: 'Hello',
      },
    },
  },
}
```

String weight syntax accepts individual values, comma-separated values, and variable-font ranges such as `100..900`.

## Raw Family Stacks

Use `families` when no provider loading is needed:

```ts
fonts: {
  families: {
    system: 'system-ui, sans-serif',
    mono: ['ui-monospace', 'SFMono-Regular', 'monospace'],
  },
}
```

This still creates `font-system` and `font-mono` shortcuts.

## Self-Hosted `@font-face`

```ts
export default defineConfig({
  engine: {
  plugins: [fonts()],
  fonts: {
    faces: [
      {
        fontFamily: 'MyCustomFont',
        src: [
          'url(/fonts/custom.woff2) format("woff2")',
          'url(/fonts/custom.woff) format("woff")',
        ],
        fontWeight: '100 900',
        fontStyle: 'normal',
        fontDisplay: 'swap',
        unicodeRange: 'U+0000-00FF',
      },
    ],
    fonts: {
      brand: {
        name: 'MyCustomFont',
        provider: 'none',
      },
    },
  },
  },
})
```

Supported descriptors include `fontFamily`, `src`, `fontDisplay`, `fontWeight`, `fontStyle`, `fontStretch`, and `unicodeRange`.

## Additional Imports

`imports` accepts one URL or an array. The plugin wraps each value in an `@import url("...")` rule and places it before provider-generated imports:

```ts
fonts: {
  imports: [
    'https://example.test/fonts.css',
  ],
  families: {
    external: 'External Font, sans-serif',
  },
}
```

Pass the URL itself, not a complete `@import` statement.

## Config Reference

| Option | Type | Default | Purpose |
|---|---|---|---|
| `provider` | Built-in or custom provider name | `'google'` | Default provider |
| `fonts` | `Record<string, FontFamilyEntry \| FontFamilyEntry[]>` | `{}` | Provider-loaded entries and shortcut tokens |
| `families` | `Record<string, string \| string[]>` | `{}` | Raw family stacks and shortcut tokens |
| `imports` | `string \| string[]` | `[]` | Additional stylesheet URLs |
| `faces` | `FontFaceDefinition[]` | `[]` | Explicit `@font-face` rules |
| `display` | `string` | `'swap'` | Display mode sent to providers |
| `providers` | `Record<string, FontsProviderDefinition>` | `{}` | Custom provider implementations |
| `providerOptions` | `Record<string, FontsProviderOptions>` | `{}` | Global options keyed by provider |

Provider options are filtered by each provider. Google `text` is mapped to `unifont` glyph subsetting. Bunny and Fontshare keep their legacy stylesheet path when `text` is configured so the existing request semantics are preserved. Unsupported keys are ignored.

## Custom Providers

Use the package's `defineFontsProvider` helper:

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'
import { defineFontsProvider, fonts } from '@pikacss/plugin-fonts'

const internal = defineFontsProvider({
  buildImportUrls(entries, context) {
    return entries.map(entry =>
      `https://fonts.example.test/css?family=${encodeURIComponent(entry.name)}&display=${encodeURIComponent(context.display)}`,
    )
  },
})

export default defineConfig({
  engine: {
  plugins: [fonts()],
  fonts: {
    provider: 'internal',
    providers: { internal },
    fonts: {
      sans: 'Example Sans:400,700',
    },
  },
  },
})
```

A custom provider may return one URL, multiple URLs, or no URL. Unknown provider names emit a structured diagnostic instead of silently loading from another provider.

## Diagnostics

Provider failures and invalid provider configuration are reported through the engine diagnostic channel. When testing custom providers, pass `onDiagnostic` to `createEngine` and assert diagnostic codes rather than spying on `console`.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `font-*` shortcut is missing | Token is absent or plugin not registered | Add the token and use `plugins: [fonts()]` |
| External request uses wrong provider | Global/per-font provider mismatch | Check the entry's `provider` override |
| Self-hosted font still triggers a request | Entry uses a network provider | Set `provider: 'none'` or use `families` |
| Provider option has no effect | Provider does not support that key | Check supported options; built-ins currently recognize `text` |
| Family fallback order is wrong | Token entries/families are ordered incorrectly | Put entries in the desired CSS family order |
| Raw import is malformed | Complete `@import` was supplied | Pass only the URL value |
