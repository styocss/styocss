---
title: Variables
description: What is the StyoCSS Variables feature.
outline: deep
---

# Variables

StyoCSS provides a powerful CSS variables system that allows you to define and use custom properties throughout your styles. This feature helps you maintain consistent values and create themeable styles.

## Configuration

The variables system can be configured through the `variables` option in your engine configuration:

```ts
interface CorePluginConfig {
	variablesPrefix?: string
	variables?: VariableConfig[]
}

type VariableConfig =
	| string
	| [name: string, value?: string, autocomplete?: VariableAutocomplete]
	| { name: string, value?: string, autocomplete?: VariableAutocomplete }

interface VariableAutocomplete {
	/**
	 * Specify the properties that the variable can be used as a value of.
	 * @default ['*']
	 */
	asValueOf?: Arrayable<string>
	/**
	 * Whether to add the variable as a CSS property.
	 * @default true
	 */
	asProperty?: boolean
}
```

## Usage

### Basic Variables

You can define simple CSS variables:

```ts
const config = {
	variables: [
		['primary-color', '#007bff'],
		['secondary-color', '#6c757d']
	]
}
```

### Variables with Autocomplete

You can configure how variables are used in autocomplete:

```ts
const config = {
	variables: [
		['primary-color', '#007bff', {
			// Only suggest in color and background-color
			asValueOf: ['color', 'background-color'],
			// Could be used as a CSS property to override
			asProperty: true
		}]
	]
}
```

### Using Variables

Variables can be used in your styles using the `var()` function:

```ts
styo({
	'color': 'var(--primary-color)',
	'background-color': 'var(--secondary-color)'
})
```

## Variable Naming

### Prefix

You can set a prefix for all variables using the `variablesPrefix` option:

```ts
const config = {
	variablesPrefix: 'theme',
	variables: [
		['primary-color', '#007bff']
	]
}
```

This will generate CSS variables like `--theme-primary-color`.

### Naming Convention

- Variables can be defined with or without the `--` prefix
- If no prefix is provided, variables are automatically prefixed with `--`
- The system normalizes variable names to ensure consistency

## Integration with Autocomplete

The variables system is integrated with StyoCSS's autocomplete feature:

- Variables are automatically added to property value suggestions
- You can specify which properties can use each variable
- Variables can be used as CSS properties themselves

## Example Usage

```ts
const config = {
	variablesPrefix: 'theme',
	variables: [
		// Basic variables
		['primary-color', '#007bff'],
		['secondary-color', '#6c757d'],

		// Variables with specific usage
		['spacing-unit', '8px', {
			asValueOf: ['margin', 'padding', 'gap'],
			asProperty: false
		}],

		// Object syntax
		{
			name: 'border-radius',
			value: '4px',
			autocomplete: {
				asValueOf: ['border-radius'],
				asProperty: true
			}
		}
	]
}
```

This configuration allows you to use variables like:

```ts
styo({
	// Using as values
	'color': 'var(--theme-primary-color)',
	'background-color': 'var(--theme-secondary-color)',
	'margin': 'var(--theme-spacing-unit)',

	// Using as properties
	'--theme-border-radius': '8px'
})
```

## Automatic Usage Detection

StyoCSS automatically detects which variables are actually used in your styles and only includes them in the final CSS output. This helps keep your CSS bundle size optimized.

## TypeScript Support

The variables system provides full TypeScript support:

- Type safety for variable names
- Autocomplete for variable values
- Property value validation
- Custom property type definitions

This ensures that you get accurate suggestions and type checking while developing your styles.
