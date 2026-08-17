---
title: ESLint Config
description: Set up ESLint rules to enforce static pika() arguments in your project.
relatedPackages:
  - '@pikacss/eslint-config'
relatedSources:
  - 'packages/eslint-config/src/index.ts'
category: getting-started
order: 50
---

# ESLint Config

PikaCSS provides an ESLint plugin to ensure all `pika()` arguments are statically analyzable at build time.

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

Add the recommended config to your `eslint.config.js`:

```ts
// eslint.config.js
import pikacss from '@pikacss/eslint-config'

export default [
  pikacss(),
]
```

To use a custom function name:

```ts
import pikacss from '@pikacss/eslint-config'

export default [
  pikacss({ fnName: 'css' }),
]
```

## Rules

### no-dynamic-args

#### Description

Enforces that all arguments to `pika()`, `pika.str()`, `pika.arr()`, and their `.str()`/`.arr()` member forms are statically analyzable at build time. Dynamic values, computed expressions, and runtime variables are not supported.

#### What Counts as Static

The rule evaluates each argument with the same value-aware evaluator the build-time compiler uses. These forms are static:

- Literals: strings, numbers, booleans, and `null`
- Object and array literals whose values are themselves static (nesting allowed): `{ color: 'red' }`, `[{ color: 'red' }, 'flex-center']`
- Template literals whose interpolations evaluate to static primitives
- Unary, binary, logical, and conditional expressions over static operands — a conditional's test must be static, but only the branch it selects has to be (and only the taken side of `&&`/`||`/`??`)
- The global constants `undefined`, `NaN`, and `Infinity`, unless shadowed by a local declaration

The following are **not** static:

- Any other variable or identifier reference — including a reference to a `const`, because the compiler never resolves bindings
- Function calls
- Member expressions
- Spread of a value that is not a static array or object
- Template literals interpolating a dynamic or non-primitive value

#### Examples

```ts
// ✅ Valid
pika({ color: 'red' })
pika({ 'color': 'red', '$:hover': { color: 'blue' } })
pika('flex-center')

// ❌ Invalid — dynamic variable
const color = getColor()
pika({ color })

// ❌ Invalid — conditional
pika(isDark ? { color: 'white' } : { color: 'black' })

// ❌ Invalid — spread
pika({ ...baseStyles })
```

## Next

- [Integrations](/integrations/unplugin) — configure PikaCSS with your build tool.
- [Usage](/getting-started/usage) — see common style patterns.
