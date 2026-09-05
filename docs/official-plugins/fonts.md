---
title: Fonts
description: Manage web font loading with provider abstraction using the fonts plugin.
relatedPackages:
  - '@pikacss/plugin-fonts'
relatedSources:
  - 'packages/plugin-fonts/src/index.ts'
  - 'packages/plugin-fonts/src/providers.ts'
  - 'packages/plugin-fonts/src/unifont-resolver.ts'
category: official-plugins
order: 40
---

# Fonts

Manage web font loading with a provider abstraction layer.

The fonts plugin handles web font loading through configurable providers. Google Fonts (`'google'`), Bunny Fonts (`'bunny'`), and Fontshare (`'fontshare'`) resolve through `unifont` at build time and are emitted as concrete `@font-face` rules. Coollabs (`'coollabs'`) and custom providers keep the stylesheet `@import` path, while `'none'` performs no loading. Every configured token also gets a `font-<token>` shortcut.

::: warning Build-time provider access
Resolving Google, Bunny, or Fontshare requires provider network access while the engine initializes. Entries that `unifont` cannot resolve fall back to the existing provider stylesheet import instead of failing the build. Provider initialization and resolution exceptions also emit a `fonts-provider-resolution-failed` warning; an empty resolution falls back silently.
:::

::: code-group

```sh [pnpm]
pnpm add -D @pikacss/plugin-fonts
```

```sh [npm]
npm install -D @pikacss/plugin-fonts
```

```sh [yarn]
yarn add -D @pikacss/plugin-fonts
```

:::

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'
import { fonts } from '@pikacss/plugin-fonts'

export default defineConfig({
  engine: {
  plugins: [fonts()],
  fonts: {
    provider: 'google',
    fonts: {
      // Shorthand string: 'Name' or 'Name:weight1,weight2'
      sans: 'Inter:400,500,600,700',
      // Object form for italic or per-font provider overrides
      mono: { name: 'Fira Code', weights: [400, 500], provider: 'bunny' },
    },
  },
  },
})
```

Each key under `fonts` (and `families`) is a token: the plugin registers a `--pk-font-<token>` CSS variable holding the resolved font-family stack and a `font-<token>` shortcut that applies it. Use the shortcut in your styles:

```ts
// Expands to { fontFamily: 'var(--pk-font-sans)' }
pika('font-sans')

// Or combine with other styles
pika('font-mono', { fontSize: '14px' })
```

Tokens named `sans`, `serif`, or `mono` under `fonts` automatically get sensible fallback stacks (e.g. `sans` falls back to `ui-sans-serif, system-ui, sans-serif`).

## Config

| Property | Description |
|---|---|
| provider | Default font provider used for entries that do not specify their own. Built-in options: `'google'`, `'bunny'`, `'fontshare'`, `'coollabs'`, `'none'`. Default: `'google'`. |
| fonts | Font families grouped by shortcut token. Each entry is a `'Name'` / `'Name:400,700'` shorthand string or a `{ name, weights, italic, provider, providerOptions }` object; entries are loaded through their provider. |
| families | Raw `font-family` CSS stacks grouped by shortcut token. No provider loading is performed — use this for fonts that are already available. |
| imports | Additional stylesheet URLs, each wrapped in an `@import url("...")` rule and injected before legacy/custom provider imports. |
| faces | Explicit `@font-face` rule definitions for self-hosted or custom fonts. |
| display | `font-display` value applied to resolved `@font-face` rules and legacy provider imports. Default: `'swap'`. |
| providers | Custom font provider definitions created with `defineFontsProvider()`, keyed by provider name. |
| providerOptions | Global defaults keyed by provider name. A font entry's `providerOptions` shallow-overrides these defaults before resolution; Google `text` maps to `unifont` glyph subsetting, while Bunny/Fontshare `text` requests retain the stylesheet path. |


### Provider option precedence

Provider options have one canonical resolution rule, independent of whether the font is handled by `unifont`, a built-in stylesheet fallback, Coollabs, or a custom provider:

```ts
fonts: {
  provider: 'custom',
  providerOptions: {
    custom: { text: 'GLOBAL', subset: 'latin' },
  },
  fonts: {
    body: {
      name: 'Example Sans',
      providerOptions: { text: 'BODY' },
    },
  },
}
```

The effective options for `Example Sans` are `{ text: 'BODY', subset: 'latin' }`: global provider options are defaults and per-font options shallow-override them. An explicit `null` or `undefined` deletes an inherited option for that font. Deletion markers are removed during normalization, so providers receive an active-only effective map.

Custom providers receive the active-only `EffectiveFontsProviderOptions` map on each `FontsProviderFontEntry.providerOptions`. `FontsProviderContext` contains only request-global `provider` and `display`; there is no second provider-options source in the context. Built-in stylesheet providers batch fonts only when their supported effective options match, and emit separate stylesheet URLs when request-scoped options such as `text` differ.

> See [API Reference — Plugin Fonts](/api/plugin-fonts) for full type signatures and defaults.

## Next

- [Reset](/official-plugins/reset) — CSS reset stylesheets.
- [Typography](/official-plugins/typography) — semantic prose styling.
