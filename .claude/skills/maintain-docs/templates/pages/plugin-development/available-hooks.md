# Available Hooks

<!-- Section: Plugin Development | Category: plugin-development -->

<!-- Hook execution order diagram -->

```mermaid
graph TD
  A[configureRawConfig] --> B[rawConfigConfigured]
  B --> C[configureResolvedConfig]
  C --> D[configureEngine]
  D --> E[transformSelectors]
  E --> F[transformStyleItems]
  F --> G[transformStyleDefinitions]
  G --> H[preflightUpdated]
  H --> I[atomicStyleAdded]
  I --> J[autocompleteConfigUpdated]
```

## configureRawConfig

### Signature
<!-- async hook signature -->

### When
<!-- When this hook fires -->

### Example

::: code-group

```ts [plugin.ts]
// <!-- Show configureRawConfig usage -->
```

:::

## rawConfigConfigured

### Signature
<!-- sync hook signature -->

### When
<!-- When this hook fires -->

### Example

::: code-group

```ts [plugin.ts]
// <!-- Show rawConfigConfigured usage -->
```

:::

## configureResolvedConfig

### Signature
<!-- async hook signature -->

### When
<!-- When this hook fires -->

### Example

::: code-group

```ts [plugin.ts]
// <!-- Show configureResolvedConfig usage -->
```

:::

## configureEngine

### Signature
<!-- async hook signature -->

### When
<!-- When this hook fires -->

### Example

::: code-group

```ts [plugin.ts]
// <!-- Show configureEngine usage -->
```

:::

## transformSelectors

### Signature
<!-- async hook signature -->

### When
<!-- When this hook fires -->

### Example

::: code-group

```ts [plugin.ts]
// <!-- Show transformSelectors usage -->
```

:::

## transformStyleItems

### Signature
<!-- async hook signature -->

### When
<!-- When this hook fires -->

### Example

::: code-group

```ts [plugin.ts]
// <!-- Show transformStyleItems usage -->
```

:::

## transformStyleDefinitions

### Signature
<!-- async hook signature -->

### When
<!-- When this hook fires -->

### Example

::: code-group

```ts [plugin.ts]
// <!-- Show transformStyleDefinitions usage -->
```

:::

## preflightUpdated

### Signature
<!-- sync hook signature -->

### When
<!-- When this hook fires -->

### Example

::: code-group

```ts [plugin.ts]
// <!-- Show preflightUpdated usage -->
```

:::

## atomicStyleAdded

### Signature
<!-- sync hook signature -->

### When
<!-- When this hook fires -->

### Example

::: code-group

```ts [plugin.ts]
// <!-- Show atomicStyleAdded usage -->
```

:::

## autocompleteConfigUpdated

### Signature
<!-- sync hook signature -->

### When
<!-- When this hook fires -->

### Example

::: code-group

```ts [plugin.ts]
// <!-- Show autocompleteConfigUpdated usage -->
```

:::

## Next
<!-- Link to Type Augmentation -->
