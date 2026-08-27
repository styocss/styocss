---
title: ESLint Config
description: Set up ESLint rules to enforce static pika() arguments in your project.
relatedPackages:
  - '@pikacss/eslint-config'
relatedSources:
  - 'packages/eslint-config/src/index.ts'
  - 'packages/eslint-config/src/lint-project.ts'
  - 'packages/eslint-config/src/rules/static-usage.ts'
category: getting-started
order: 50
---

# ESLint Config

PikaCSS provides a configured ESLint flat config that checks static usage of
the roots declared by your canonical project configuration.

## Setup

Install the package:

::: code-group

```sh [pnpm]
pnpm add -D @pikacss/eslint-config
```

```sh [npm]
npm install -D @pikacss/eslint-config
```

```sh [yarn]
yarn add -D @pikacss/eslint-config
```

:::

Add the async factory to your `eslint.config.mjs`:

```ts
// eslint.config.mjs
import pikacss from '@pikacss/eslint-config'

export default [
  await pikacss(),
]
```

The factory discovers the canonical PikaCSS config from the project. Pass
`config` when you need to select its path explicitly:

```ts
import pikacss from '@pikacss/eslint-config'

export default [
  await pikacss({ config: './pika.config.mts' }),
]
```

The factory derives the configured roots, readonly ESLint globals, scan
ownership, and private rule model from that one config. Do not register a
manual plugin or configure rule semantics separately.

## Rules

### static-usage

#### Description

`pikacss/static-usage` checks direct calls to configured PikaCSS roots. It
reports arguments outside the compiler's bounded static subset, invalid
compile-time root usage, roots outside their owning scan scope, and
cross-entry root dependencies.

#### What Counts as Static

The rule uses three evaluator states:

- **Known** — the value is determined from the source and lexical scope.
- **Engine-dependent** — a legal static-extension chain depends on the
  configured engine; the compiler checks its terminal value during Prepare.
- **Invalid** — the expression is outside the bounded static subset and is
  reported by ESLint.

Known values include:

- literals, recursively static objects and arrays, and supported operators;
- template literals whose interpolations are static primitives; and
- the global constants `undefined`, `NaN`, and `Infinity`, unless shadowed by
  a local declaration.

Static-extension chains support dot access and computed keys that evaluate to
strings or numbers. A key that flows from another extension is
engine-dependent, so compiler Prepare remains the authority for its terminal
value and type.

The following are **invalid**:

- an ordinary runtime variable used as a computed extension key;
- a known computed extension key that is not a string or number;
- function calls, unsupported member usage, or dynamic spreads; and
- template literals interpolating a dynamic or non-primitive value.

#### Examples

```ts
// ✅ Valid
pika({ color: 'red' })
pika({ 'color': 'red', '$:hover': { color: 'blue' } })
pika('flex-center')
pika({ color: pika['theme'].colors.primary })
pika({ color: pika[pika.keys.theme].colors.primary }) // compiler Prepare checks the extension terminal

// ❌ Invalid — dynamic variable
const color = getColor()
pika({ color })

// ❌ Invalid — conditional
pika(isDark ? { color: 'white' } : { color: 'black' })

// ❌ Invalid — spread
pika({ ...baseStyles })
```

## Migration

- `pikacss/no-dynamic-args` was removed; this factory enables
  `pikacss/static-usage`.
- The manual `{ fnName }` factory option was removed. Configured root names
  come from the canonical PikaCSS project config; `config` is the only factory
  option.
- Legacy `.str`/`.arr` rule behavior was removed; those are not variants of
  `pikacss/static-usage`.

## Next

- [Integrations](/integrations/unplugin) — configure PikaCSS with your build tool.
- [Usage](/getting-started/usage) — see common style patterns.
