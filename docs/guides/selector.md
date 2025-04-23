---
title: Selector
description: What is the PikaCSS Selector feature.
outline: deep
---

# Selector

PikaCSS provides a powerful selector system that allows you to transform and customize CSS selectors in your styles. This feature enables you to create dynamic and reusable selectors while maintaining type safety and autocomplete support.

## Configuration

The selector system can be configured through the `selectors` option in your engine configuration:

```ts
type SelectorConfig =
	| string
	| [selector: RegExp, value: (matched: RegExpMatchArray) => Awaitable<Arrayable<string>>, autocomplete?: Arrayable<string>]
	| [selector: string, value: Arrayable<string>]
	| {
		selector: RegExp
		value: (matched: RegExpMatchArray) => Awaitable<Arrayable<string>>
		autocomplete?: Arrayable<string>
	}
	| {
		selector: string
		value: Arrayable<string>
	}
```

## Usage

### Static Selectors

You can define static selectors that map to specific CSS selectors:

```ts
const config = {
	selectors: [
		['hover', '$:hover'],
		['focus', '$:focus'],
		['dark', '.dark $']
	]
}
```

### Dynamic Selectors

For more complex scenarios, you can use regular expressions and functions to create dynamic selectors:

```ts
const config = {
	selectors: [
		// Define responsive breakpoint selectors
		[/^from-(\d+)$/, match => `@media (min-width: ${match[1]}px)`],
		[/^to-(\d+)$/, match => `@media (max-width: ${match[1]}px)`],

		// Examples:
		// from-768 generates @media (min-width: 768px)
		// to-1024 generates @media (max-width: 1024px)

		// Usage:
		// pika({
		//   'from-768': {
		//     display: 'block'  // Show when screen width >= 768px
		//   },
		//   'to-1024': {
		//     display: 'none'   // Hide when screen width <= 1024px
		//   }
		// })
	]
}
```

## Default Selector

PikaCSS uses a default selector system that can be configured through the `defaultSelector` option:

```ts
interface EngineConfig {
	/**
	 * Default value for selector. (`'$$'` will be replaced with the atomic style name.)
	 *
	 * @example '.$$' - Usage in class attribute: `<div class="a b c">`
	 * @example '[data-pika~="$$"]' - Usage in attribute selector: `<div data-pika="a b c">`
	 * @default '.$$'
	 */
	defaultSelector?: string
}
```

## Placeholders

The system uses two main placeholders:

- `$$`: Represents the atomic style name
- `$`: Represents the default selector

These placeholders are automatically replaced with appropriate values during style processing.

## Integration with Autocomplete

The selector system is integrated with PikaCSS's autocomplete feature:

- Static selectors are automatically added to the autocomplete suggestions
- Dynamic selectors can specify custom autocomplete values
- The system maintains type safety for selector usage

## Example Usage

```ts
const config = {
	selectors: [
		// Static selectors
		['hover', '$:hover'],
		['focus', '$:focus'],

		// Dynamic selectors with autocomplete
		[/^from-(\d+)$/, match => `@media (min-width: ${match[1]}px)`, ['from-640', 'from-768', 'from-1024']],

		// Object syntax
		{
			selector: 'dark',
			value: '.dark $'
		}
	],
	defaultSelector: '.$$'
}
```

This configuration allows you to use selectors like:

```ts
pika({
	// .$$:hover {
	//     color: red
	// }
	'hover': {
		color: 'red',
	},
	// @media (min-width: 768px) {
	//     .$$ {
	//         display: flex;
	//     }
	// }
	'from-768': {
		display: 'flex',
	},
	// .dark .$$ {
	//     background: black
	// }
	'dark': {
		background: 'black',
	},
})
```

The selectors will be transformed according to your configuration, and you'll get proper autocomplete support in your IDE.
