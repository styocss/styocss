---
title: Selectors
description: Learn how to use selectors in PikaCSS
outline: deep
---

# Selectors

Selectors are a powerful feature in PikaCSS that allows you to define custom selectors and transform them into complex CSS selectors. This enables you to create more expressive styles and simplify common CSS patterns.

## How Selectors Work in PikaCSS

In PikaCSS, selectors can be defined in your configuration file and used in your styles. PikaCSS supports two types of selectors:

1. **Static selectors**: Direct mapping to specific CSS selectors
2. **Dynamic selectors**: Using RegExp matching patterns and transform functions

The selector system works by transforming custom selectors you use in your styles into actual CSS selectors, all done at build time with no runtime overhead.

## Defining Custom Selectors

In your `pika.config.ts` file, you can define custom selectors:

```ts
import { defineEngineConfig } from '@pikacss/vite-plugin-pikacss'

export default defineEngineConfig({
	selectors: {
		selectors: [
			// Static selectors - [name, value]
			[':hover', '$:hover'],
			[':focus', '$:focus'],
			[':active', '$:active'],

			// Media query selectors
			['@light', 'html:not(.dark) $'],
			['@dark', 'html.dark $'],

			// Responsive breakpoints
			['@screen-sm', '@media screen and (min-width: 576px) and (max-width: 767.9px)'],
			['@screen-md', '@media screen and (min-width: 768px) and (max-width: 991.9px)'],
			['@screen-lg', '@media screen and (min-width: 992px) and (max-width: 1199.9px)'],
		]
	}
})
```

## Selector Configuration Options

Selector configurations can take various forms:

### 1. Static Selectors

Using array syntax `[selector name, CSS selector]`:

```ts
selectors: [
	// Static selectors
	[':hover', '$:hover'],
	[':focus', '$:focus'],
	['@dark', 'html.dark $'],
]
```

Here, the `:hover` selector will be transformed to `$:hover` (which ultimately becomes `.xxx:hover`).

### 2. Dynamic Selectors

Using RegExp and transform functions:

```ts
selectors: [
	// Dynamic selector
	[/^@screen-(\d+)$/, m => `@media (min-width: ${m[1]}px)`, ['@screen-768', '@screen-1024']],
]
```

Dynamic selectors allow you to create more flexible selector patterns that can generate different outputs based on parameters in the name.

### 3. Object Syntax

You can also use object syntax to define selectors:

```ts
selectors: [
	{
		selector: '@dark',
		value: 'html.dark $',
	},
	{
		selector: /^@screen-(\d+)$/,
		value: m => `@media (min-width: ${m[1]}px)`,
		autocomplete: ['@screen-768', '@screen-1024'],
	},
]
```

## Using Custom Selectors in Styles

Once you have defined custom selectors, you can use them in your styles:

```ts
// Using pseudo-class selectors
pika({
	'color': 'black',
	':hover': {
		color: 'blue',
	},
})

// Using theme selectors
pika({
	'color': 'black',
	'@dark': {
		color: 'white',
	},
})

// Using responsive breakpoints
pika({
	'fontSize': '1rem',
	'@screen-md': {
		fontSize: '1.25rem',
	},
	'@screen-lg': {
		fontSize: '1.5rem',
	},
})
```

## Selector Nesting

PikaCSS supports multi-level nested syntax, allowing you to freely combine various CSS features:

```ts
pika({
	'display': 'flex',
	'gap': '1rem',

	// Using selectors within media queries
	'@screen-md': {
		':hover': {
			transform: 'scale(1.05)',
		},
	},

	// Using media queries within selectors
	':hover': {
		'@media (prefers-reduced-motion)': {
			transition: 'none',
		},
	},

	// Mixing multiple selectors and media queries
	'$.active::before': {
		'content': '"✓"',
		'@screen-sm': {
			display: 'none',
		},
	},
})
```

:::warning
Considering TypeScript's performance, we limit the nesting level to 5 levels, which should be sufficient for most requirements.
:::

## Selectors with TypeScript Support

When you define selectors in your configuration, PikaCSS automatically generates TypeScript definitions, providing autocomplete:

```ts
// TypeScript will show autocomplete for your defined selectors
pika({
	'@dark': { // ✓ Valid - autocomplete works
		color: 'white',
	},
	'@unknown-selector': { // ✗ Unknown selector - no autocomplete
		color: 'blue',
	},
})
```

## Real World Use Cases

### 1. Theme Switching

Implementing light/dark theme switching with selectors:

```ts
// Define theme selectors in your config
selectors: [
	['@light', 'html:not(.dark) $'],
	['@dark', 'html.dark $'],
]

// Use in your application
const styles = {
	card: pika({
		'backgroundColor': 'white',
		'color': 'black',
		'boxShadow': '0 2px 8px rgba(0, 0, 0, 0.1)',

		'@dark': {
			backgroundColor: '#222',
			color: 'white',
			boxShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
		}
	})
}

// Toggle dark theme in HTML
document.documentElement.classList.toggle('dark')
```

### 2. Responsive Design

Creating responsive layouts:

```ts
const styles = {
	header: pika({
		'fontSize': '1.25rem',
		'padding': '0.5rem',

		'@screen-md': {
			fontSize: '1.5rem',
			padding: '1rem',
		},

		'@screen-lg': {
			fontSize: '2rem',
			padding: '1.5rem',
		}
	})
}
```

### 3. Complex State Management

Managing multiple component states:

```ts
// Define state selectors in your config
selectors: [
	[':disabled', '$:disabled'],
	[':focus', '$:focus'],
	[':hover', '$:hover'],
	[':active', '$:active'],
	['.loading', '$.loading'],
	['.error', '$.error'],
]

// Apply in your component
const styles = {
	button: pika({
		'backgroundColor': 'blue',
		'color': 'white',

		':hover': {
			backgroundColor: 'darkblue',
		},

		':active': {
			transform: 'scale(0.98)',
		},

		':disabled': {
			backgroundColor: 'gray',
			cursor: 'not-allowed',
		},

		'.loading': {
			opacity: '0.7',
		},

		'.error': {
			backgroundColor: 'red',
		}
	})
}
```

## Best Practices

1. **Naming Consistency**: Use consistent naming patterns for your selectors, such as using the `@` prefix for media queries or special selectors.

2. **Logical Organization**: Organize your selectors in a logical order, such as listing base styles first, then state variations (hover, focus, etc.), and finally responsive rules.

3. **Provide Autocomplete**: Always provide `autocomplete` options for dynamic selectors to enhance the developer experience.

4. **Reuse Common Patterns**: Create custom selectors for commonly used selector patterns to reduce repetitive code.

5. **Avoid Excessive Nesting**: While PikaCSS supports deep nesting, excessive nesting can make your code harder to maintain and understand.

## Common Selector Examples

Here are some common selector configuration examples:

```ts
import { defineEngineConfig } from '@pikacss/vite-plugin-pikacss'

export default defineEngineConfig({
	selectors: {
		selectors: [
			// Theme related
			['@light', 'html:not(.dark) $'],
			['@dark', 'html.dark $'],

			// Responsive breakpoints
			['@screen-xs', '@media screen and (max-width: 575.9px)'],
			['@screen-sm', '@media screen and (min-width: 576px) and (max-width: 767.9px)'],
			['@screen-md', '@media screen and (min-width: 768px) and (max-width: 991.9px)'],
			['@screen-lg', '@media screen and (min-width: 992px) and (max-width: 1199.9px)'],
			['@screen-xl', '@media screen and (min-width: 1200px) and (max-width: 1399.9px)'],
			['@screen-xxl', '@media screen and (min-width: 1400px)'],

			// Dynamic responsive breakpoints
			[/^@min-w-(\d+)$/, m => `@media (min-width: ${m[1]}px)`, ['@min-w-640', '@min-w-768', '@min-w-1024']],

			// Common interaction states
			[':hover', '$:hover'],
			[':focus', '$:focus'],
			[':active', '$:active'],
			[':disabled', '$:disabled'],

			// Dark mode interaction states
			['@dark:hover', 'html.dark $:hover'],

			// Print media query
			['@print', '@media print'],

			// Other media queries
			['@motion-reduce', '@media (prefers-reduced-motion: reduce)'],
			['@portrait', '@media (orientation: portrait)'],
			['@landscape', '@media (orientation: landscape)'],
		]
	}
})
```
