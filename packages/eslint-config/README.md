# @pikacss/eslint-config

ESLint flat config for PikaCSS that enforces compiler-aligned static usage for
roots from the canonical project configuration.

## Installation

```bash
pnpm add -D @pikacss/eslint-config
```

## Usage

```js
// eslint.config.mjs
import pikacss from '@pikacss/eslint-config'

export default [
  await pikacss(),
]
```

The async factory loads the canonical PikaCSS project config and derives the
configured roots, readonly ESLint globals, scan ownership, and private rule
model from that one source. To select a config file explicitly:

```js
import pikacss from '@pikacss/eslint-config'

export default [
  await pikacss({ config: './pika.config.mts' }),
]
```

The factory registers `pikacss/static-usage`. It has no rule options and this
package does not expose an unconfigured public plugin for manual semantic
configuration. The named `recommended` export is the same async factory as
`pikacss`.

## Migration

The legacy ESLint setup changed in these breaking ways:

- `pikacss/no-dynamic-args` was removed; the factory now enables
  `pikacss/static-usage`.
- The manual `{ fnName }` option was removed; configured roots come from the
  canonical PikaCSS project config, and `config` is the only factory option.
- Legacy `.str`/`.arr` rule behavior was removed; they are not variants of the
  current `pikacss/static-usage` rule.

## Documentation

See the [ESLint setup guide](https://pikacss.github.io/getting-started/eslint-config)
and the [`pikacss/static-usage` rule reference](./docs/rules/static-usage.md).

## License

MIT
