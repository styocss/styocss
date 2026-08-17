# `pikacss/no-dynamic-args`

> Disallow arguments to PikaCSS macro calls that the build-time compiler cannot statically evaluate.

PikaCSS resolves `pika()` (and its `.str` and `.arr` variants) at build time by statically evaluating the call arguments. An argument the compiler cannot evaluate throws a `PikaTransformError` and fails the whole module transform. This rule flags those arguments in your editor instead of letting them fail during the build.

The rule is **aligned with the compiler's evaluator**: it runs the same value-aware static evaluation the transform runs, so it never flags a call the build would have handled, and never green-lights one the build would reject.

## Accepted (static) arguments

- String / number / boolean / `null` literals
- Objects and arrays composed recursively of accepted values, including:
  - spreads of static **arrays** inside array literals and call arguments
  - spreads of static **objects** inside object literals
  - computed keys that evaluate to a **string or number**
  - array holes (`[,]`, evaluated as `undefined`)
- Template literals whose interpolated expressions evaluate to a primitive (string, number, boolean, `null`, or `undefined`) — e.g. `` `x-${1}` ``, `` `x-${null}` ``
- Unary `-`, `+`, `!`, `void` on a static operand
- Binary `-`, `*`, `/`, `===`, `!==` with static operands (evaluated with JavaScript number coercion, so e.g. `null - null` is the static value `0`)
- Binary `+` when at least one operand evaluates to a string, or both evaluate to numbers
- Logical `&&`, `||`, `??` with a static left operand — the right operand is evaluated **only when the left value does not decide the result** (short-circuit), so dead operands may be dynamic: `false && dynamicVar`, `true || dynamicVar`, `'base' ?? dynamicVar` are all accepted
- Conditional `cond ? a : b` with a static test — only the **taken branch** must be static: `true ? 'a' : dynamicVar` is accepted
- The global constants `undefined`, `NaN`, `Infinity` — unless shadowed by a binding with a real declaration (a plain ESLint `globals` entry does not count as shadowing, matching the compiler's Babel-scope lookup)
- TypeScript assertion wrappers (`x!`, `x as T`, `x satisfies T`, `<T>x`) and parentheses around any accepted expression

## Reported (dynamic or build-failing) arguments

Anything else. That includes the usual dynamic shapes — bare identifiers/variables, member expressions, function/`new`/tagged-template calls, `await`/`yield`, assignments, sequences, regex and BigInt literals, unsupported operators (bitwise, `%`, `**`, `==`, `!=`, `typeof`, …), and any **needed** operand that is not static — plus the shape-static forms the compiler hard-errors on:

- `+` whose operands are neither a string on either side nor both numbers (`null + null`, `true + 1`)
- Template interpolation of a non-primitive value (`` `x-${{ a: 1 }}` ``)
- Spread of a value with the wrong shape: a non-array in array/call position (`pika(...{})`), a non-object in object position (`{ ...[1] }`, `{ ...null }`)
- Computed keys that do not evaluate to a string or number (`{ [null]: 'x' }`)

Examples of **correct** code:

```ts
pika({ color: 'red' })
pika(`p-${2}`) // static template expression
pika(true ? 'a' : dynamicVar) // only the taken branch must be static
pika(false && dynamicVar) // short-circuit: the right operand is never evaluated
```

Examples of **incorrect** code:

```ts
/* eslint-disable pikacss/no-dynamic-args */
pika(color) // variable reference
pika({ color: theme.primary }) // member expression
pika(`p-${size}`) // dynamic template expression
pika(null + null) // '+' on non-string/non-number operands fails the build
pika(`x-${{ a: 1 }}`) // non-primitive template interpolation fails the build
```

## Scope awareness

A call whose callee **root** is a binding with a real declaration — an import, variable, parameter, or function/class declaration — is skipped: it is your own function, not a PikaCSS macro. This mirrors the transformer's scope-based shadowing. A configured ESLint global (e.g. `languageOptions.globals: { pika: 'readonly' }` to silence `no-undef`) is **not** a declaration: the build-time transform still rewrites those calls, so the rule keeps checking them.

```ts
const pika = (v: string) => v
pika(dynamic) // not reported — your `pika`, not the macro
```

The same declaration-based lookup governs `undefined`/`NaN`/`Infinity`: `pika(undefined)` is accepted, but after `const undefined = something` the identifier is a real local binding and is reported.

## Options

```jsonc
{
	"pikacss/no-dynamic-args": ["error", { "fnName": "pika" }]
}
```

- `fnName` (string, default `"pika"`) — the base macro name. The `.str`/`.arr` variants are derived automatically.
