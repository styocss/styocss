# `pikacss/static-usage`

> Enforce compiler-aligned static usage for configured PikaCSS roots.

The `static-usage` rule is enabled by the configured `pikacss()` factory. It
loads the canonical PikaCSS project configuration, derives the roots and scan
ownership from that config, and keeps the resulting project model private to
the returned ESLint plugin.

## Setup

Use the async factory in your ESLint flat config:

```js
// eslint.config.mjs
import pikacss from '@pikacss/eslint-config'

export default [
  await pikacss(),
]
```

Pass `config` only when the canonical project config is not discovered at the
default location:

```js
import pikacss from '@pikacss/eslint-config'

export default [
  await pikacss({ config: './pika.config.mts' }),
]
```

The factory registers `pikacss/static-usage` and exposes every configured root
as a readonly ESLint global. The globals prevent a separate `no-undef` rule
from flagging compile-time roots; they do not configure the rule's semantics.
Do not register an unconfigured public plugin or pass options to the rule.

## What It Checks

The rule checks direct calls to roots declared by the canonical project config.
It reports:

- arguments outside the compiler's bounded static subset;
- invalid compile-time use of a configured root, such as a standalone root,
  optional access, member calls, or a nested base call;
- configured-root use outside its owning scan scope; and
- a base call that depends on a root owned by another configured entry.

Local declarations still shadow a configured root. For example, a locally
declared `pika` function is treated as application code rather than as the
compile-time root.

## Bounded Static Evaluation

The evaluator classifies each expression into three states:

- **Known** — the value is determined from the source expression and lexical
  scope. Literals, recursively static objects and arrays, supported operators,
  templates, and the compiler's global constants are handled here.
- **Engine-dependent** — the expression is a legal direct static-extension
  chain, or depends on one. The rule does not execute or guess the extension's
  terminal value; the compiler remains authoritative during Prepare.
- **Invalid** — the expression is provably outside the bounded subset, such as
  an ordinary runtime variable or an unsupported operation. The rule reports
  it before the build.

Static-extension chains may use dot access and computed keys that are known to
be strings or numbers:

<!-- eslint-skip -->
```ts
pika({ color: pika.theme.colors.primary })
pika({ color: pika['theme'].colors.primary })
pika({ color: pika['the' + 'me'].colors.primary })
```

When a computed key flows from another extension, the chain is
engine-dependent and its terminal type is checked by compiler Prepare:

<!-- eslint-skip -->
```ts
pika({ color: pika[pika.keys.theme].colors.primary })
```

An ordinary dynamic identifier or a known non-string/number key is invalid:

<!-- eslint-skip -->
```ts
pika({ value: pika[dynamicKey] }) // invalid
pika({ value: pika[null] }) // invalid
```

## Migration

The ESLint configuration migration has these breaking changes:

- `pikacss/no-dynamic-args` is removed. Use the async `pikacss()` factory,
  which enables `pikacss/static-usage`.
- The manual `{ fnName }` factory option is removed. Configured root names now
  come only from the canonical PikaCSS project config; `config` is the only
  factory option.
- The legacy `.str`/`.arr` rule behavior is removed. They are not configured
  variants of `pikacss/static-usage`.

See the [ESLint setup guide](https://pikacss.github.io/getting-started/eslint-config)
for the project-level configuration example.
