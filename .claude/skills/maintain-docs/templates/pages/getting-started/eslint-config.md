# ESLint Config

<!-- Section: Getting Started | Category: getting-started -->

## Setup

<!-- Show how to install and configure @pikacss/eslint-config -->

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

::: code-group

```ts [eslint.config.ts]
// <!-- Show ESLint flat config setup -->
```

:::

## Rules

### no-dynamic-args

#### Description
<!-- Explain what the rule checks and why it matters -->

#### What Counts as Static
<!-- Explain the static analysis criteria for pika() arguments -->

#### Examples

<!-- Show valid and invalid code examples -->

::: tip Valid
```ts
// <!-- Static pika() usage examples -->
```
:::

::: danger Invalid
```ts
// <!-- Dynamic pika() usage examples that trigger the lint rule -->
```
:::

## Next
<!-- Link to Agent Skills or other relevant pages -->
