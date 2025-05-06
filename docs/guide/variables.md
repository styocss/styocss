---
title: Variables
description: Learn how to use CSS variables in PikaCSS
outline: deep
---

# Variables

CSS variables (custom properties) are powerful features in modern web development that allow for dynamic styling, theme switching, and code reusability. PikaCSS provides a robust system for declaring, managing, and using CSS variables in your project.

## How Variables Work in PikaCSS

In PikaCSS, CSS variables can be defined in your configuration and automatically added to your `:root` element. This allows for:

- Consistent design tokens across your application
- Dynamic theme switching using CSS variables
- Type-safe variable usage with TypeScript support
- Better organization of your design system

## Defining Variables

You can define variables in your `pika.config.ts` file:

```ts
import { defineEngineConfig } from '@pikacss/vite-plugin-pikacss'

export default defineEngineConfig({
	variables: {
		variables: [
			// Basic usage: [name, value]
			['color-primary', '#ff007f'],
			['font-sans', 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'],
			['spacing-base', '1rem'],

			// With autocomplete configuration
			['color-secondary', '#6b21a8', {
				// Specify which properties this variable can be used with
				asValueOf: ['color', 'background-color', 'border-color'],
				// Whether this variable should be available as a CSS property
				asProperty: true
			}],
		],
	}
})
```

## Variable Configuration Options

Each variable can be defined with the following options:

```ts
// Basic format - array syntax
['variable-name', 'value', autocompleteOptions, pruneUnused]
```

| Option | Description |
|--------|-------------|
| `name` | The name of the CSS variable (with / without the `--` prefix) |
| `value` | The value of the CSS variable |
| `autocomplete` | Configuration for TypeScript autocomplete (optional) |
| `pruneUnused` | Whether to remove unused variables from the final CSS (defaults to `true`) |

### Autocomplete Options

The `autocomplete` object allows you to control how the variable appears in TypeScript autocomplete:

```ts
const autocomplete = {
	// Specify which CSS properties can use this variable as a value
	// Use '*' for all properties, or specific property names
	asValueOf: ['color', 'background-color'],

	// Whether to add the variable as a CSS property itself
	asProperty: true,
}
```

## Using Variables in Styles

Once defined, you can use your CSS variables in your styles:

```ts
// Using a CSS variable in styles
pika({
	// As a property value
	color: 'var(--color-primary)',
	backgroundColor: 'var(--color-secondary)',

	// In calculations
	padding: 'calc(var(--spacing-base) * 2)',
	margin: 'calc(var(--spacing-base) / 2)',

	// With fallbacks
	fontFamily: 'var(--font-custom, var(--font-sans))'
})
```

## Variables with TypeScript Support

When you define variables in your configuration, PikaCSS automatically generates TypeScript definitions, providing autocomplete:

```ts
// TypeScript will show autocomplete for your defined variables
pika({
	color: 'var(--color-primary)', // ✓ Valid - autocomplete works
	backgroundColor: 'var(--unknown-variable)' // ✗ Error - unknown variable
})
```

## Variable Pruning

By default, PikaCSS performs "pruning" of unused variables, meaning that only variables actually used in your styles will be included in the final CSS output. This helps to minimize your CSS bundle size.

You can disable this behavior globally or per variable:

```ts
export default defineEngineConfig({
	variables: {
		// Disable pruning globally
		pruneUnused: false,

		variables: [
			// This variable will be included even if unused
			['always-included', 'value', {}, false],

			// This variable follows the global setting (pruned if unused)
			['maybe-included', 'value']
		],
	}
})
```

## Dynamic Variables with Preflights

For more complex variable definitions or dynamic variables, you can use preflights:

```ts
export default defineEngineConfig({
	preflights: [
		// Define CSS variables in a preflight
		`:root {
			--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
			--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
			--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
		}`,

		// Dark mode variables
		`@media (prefers-color-scheme: dark) {
			:root {
				--bg-surface: #121212;
				--text-primary: rgba(255, 255, 255, 0.87);
			}
		}`,
	]
})
```

## Adding Variables Programmatically

You can also add variables programmatically using the Engine API:

```ts
import { createEngine } from '@pikacss/core'

const engine = createEngine()

// Add CSS variables
engine.extra.variables.add(
	['dynamic-color', '#ff0000'],
	['dynamic-size', '1.5rem', { asValueOf: ['width', 'height', 'font-size'] }]
)
```

## Best Practices

1. **Consistent Naming**: Use a consistent naming convention for your variables, such as `category-name-variant` (e.g., `color-primary-light`).

2. **Organize by Purpose**: Group variables by their purpose or category for better organization.

3. **Use Variables for Theming**: Define color schemes, spacing scales, and other theme-related values as variables to make theme switching easier.

4. **Provide Fallbacks**: When using variables in critical places, provide fallbacks to ensure graceful degradation.

5. **Leverage TypeScript**: Take advantage of PikaCSS's TypeScript support to ensure you're using valid variable names.

## Common Examples

### Color System

```ts
export default defineEngineConfig({
	variables: {
		variables: [
			// Primary colors
			['color-primary-50', '#eff6ff'],
			['color-primary-100', '#dbeafe'],
			['color-primary-500', '#3b82f6'],
			['color-primary-900', '#1e3a8a'],

			// Semantic colors
			['color-success', '#10b981'],
			['color-warning', '#f59e0b'],
			['color-error', '#ef4444'],
			['color-info', '#06b6d4'],
		],
	}
})
```

### Spacing Scale

```ts
export default defineEngineConfig({
	variables: {
		variables: [
			['space-0', '0'],
			['space-1', '0.25rem'],
			['space-2', '0.5rem'],
			['space-4', '1rem'],
			['space-6', '1.5rem'],
			['space-8', '2rem'],
			['space-12', '3rem'],
			['space-16', '4rem'],
			['space-24', '6rem'],
			['space-32', '8rem'],
		],
	}
})
```

### Typography System

```ts
export default defineEngineConfig({
	variables: {
		variables: [
			// Font families
			['font-sans', 'ui-sans-serif, system-ui, sans-serif'],
			['font-serif', 'ui-serif, Georgia, serif'],
			['font-mono', 'ui-monospace, monospace'],

			// Font sizes
			['text-xs', '0.75rem'],
			['text-sm', '0.875rem'],
			['text-base', '1rem'],
			['text-lg', '1.125rem'],
			['text-xl', '1.25rem'],
			['text-2xl', '1.5rem'],

			// Line heights
			['leading-none', '1'],
			['leading-tight', '1.25'],
			['leading-normal', '1.5'],
			['leading-relaxed', '1.75'],
		],
	}
})
```

### Theme Variables

```ts
export default defineEngineConfig({
	preflights: [
		// Light theme (default)
		`:root {
			--color-bg: white;
			--color-text: #111827;
			--color-border: #e5e7eb;
		}`,

		// Dark theme
		`html.dark {
			--color-bg: #111827;
			--color-text: #f9fafb;
			--color-border: #374151;
		}`
	]
})
```
