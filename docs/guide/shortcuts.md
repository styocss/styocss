---
title: Shortcuts
description: Learn how to use shortcuts in PikaCSS
outline: deep
---

# Shortcuts

Shortcuts are a powerful feature in PikaCSS that allows you to define reusable style combinations that can be applied with a single string. This enables you to create more maintainable and consistent styles across your application.

## How Shortcuts Work in PikaCSS

In PikaCSS, shortcuts can be defined in your configuration file and used in your styles. PikaCSS supports two types of shortcuts:

1. **Static shortcuts**: Direct mapping to style objects
2. **Dynamic shortcuts**: Using RegExp matching patterns and transform functions

The shortcuts system works by transforming shortcut strings you use into actual style objects, all done at build time with no runtime overhead.

## Defining Custom Shortcuts

In your `pika.config.ts` file, you can define custom shortcuts:

```ts
import { defineEngineConfig } from '@pikacss/vite-plugin-pikacss'

export default defineEngineConfig({
	shortcuts: {
		shortcuts: [
			// Static shortcut - [name, style object]
			['flex-center', {
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
			}],

			// Dynamic shortcut with RegExp pattern
			[/^m-(\d+)$/, m => ({ margin: `${m[1]}px` }), ['m-4', 'm-8']],

			// Complex shortcut with nested selectors
			['main-container', {
				'width': '100%',
				'maxWidth': '1200px',
				'margin': '0 auto',
				'padding': '0 1rem',
				'@screen-md': {
					padding: '0 2rem',
				},
			}],
		]
	}
})
```

## Shortcut Configuration Options

Shortcut configurations can take various forms:

### 1. Static Shortcuts

Using array syntax `[shortcut name, style object]`:

```ts
shortcuts: [
	// Static shortcuts
	['flex-center', {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
	}],
	['card', {
		padding: '1rem',
		borderRadius: '0.5rem',
		boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
	}],
]
```

Here, the `flex-center` shortcut will be replaced with the corresponding style object properties when used.

### 2. Dynamic Shortcuts

Using RegExp and transform functions:

```ts
shortcuts: [
	// Dynamic shortcut
	[/^m-(\d+)$/, m => ({ margin: `${m[1]}px` }), ['m-4', 'm-8']],
	[/^p-(\d+)$/, m => ({ padding: `${m[1]}px` }), ['p-4', 'p-8']],
	[/^grid-cols-(\d+)$/, m => ({
		display: 'grid',
		gridTemplateColumns: `repeat(${m[1]}, minmax(0, 1fr))`
	}), ['grid-cols-2', 'grid-cols-3', 'grid-cols-4']],
]
```

Dynamic shortcuts allow you to create more flexible patterns that can generate different style objects based on parameters in the name. The optional third parameter provides autocompletion suggestions.

### 3. Object Syntax

You can also use object syntax to define shortcuts:

```ts
shortcuts: [
	{
		shortcut: 'flex-center',
		value: {
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
		},
	},
	{
		shortcut: /^m-(\d+)$/,
		value: m => ({ margin: `${m[1]}px` }),
		autocomplete: ['m-4', 'm-8'],
	},
]
```

## Using Shortcuts in Styles

Once you have defined shortcuts, you can use them in your styles in two ways:

### 1. Direct Usage

Using shortcuts directly as strings in the `pika()` function:

```ts
// Using a shortcut directly
pika('flex-center')

// Using multiple shortcuts
pika('flex-center', 'card')

// Using dynamic shortcuts
pika('m-4')

// Combining shortcuts and style objects
pika('flex-center', { color: 'blue' })
```

### 2. Using the `__shortcut` Property

Using the `__shortcut` property in style objects:

```ts
// Using a shortcut in a style object
pika({
	__shortcut: 'flex-center',
	color: 'blue',
})

// Using multiple shortcuts
pika({
	__shortcut: ['flex-center', 'card'],
	color: 'blue',
})
```

## Shortcut Resolution

PikaCSS processes shortcuts in the following way:

1. When a string is passed to `pika()`, it checks if it's a registered shortcut
2. If it is, the shortcut is replaced with its corresponding style properties
3. Shortcuts can refer to other shortcuts, creating chains of style compositions
4. All shortcuts are resolved at build time, resulting in atomic CSS classes

## Shortcuts with TypeScript Support

When you define shortcuts in your configuration, PikaCSS automatically generates TypeScript definitions, providing autocomplete:

```ts
// TypeScript will show autocomplete for your defined shortcuts
pika('flex-center') // ✓ Valid - autocomplete works
pika('unknown-shortcut') // ✗ Unknown shortcut - no autocomplete

// Also works with the __shortcut property
pika({
	__shortcut: 'flex-center', // ✓ Valid - autocomplete works
	color: 'blue',
})
```

## Real World Use Cases

### 1. Component Base Styles

Creating consistent component base styles:

```ts
// Define base component shortcuts in your config
shortcuts: [
	['button-base', {
		display: 'inline-flex',
		alignItems: 'center',
		justifyContent: 'center',
		padding: '0.5rem 1rem',
		borderRadius: '0.25rem',
		fontWeight: '500',
		transition: 'all 0.2s',
	}],
	['button-primary', {
		'__shortcut': 'button-base',
		'backgroundColor': 'var(--color-primary)',
		'color': 'white',
		':hover': {
			backgroundColor: 'var(--color-primary-dark)',
		},
	}],
	['button-secondary', {
		'__shortcut': 'button-base',
		'backgroundColor': 'var(--color-secondary)',
		'color': 'white',
		':hover': {
			backgroundColor: 'var(--color-secondary-dark)',
		},
	}],
]

// Use in your application
const styles = {
	submitButton: pika('button-primary'),
	cancelButton: pika('button-secondary'),
}
```

### 2. Layout Patterns

Creating reusable layout patterns:

```tsx
// Define layout shortcuts
shortcuts: [
	['container', {
		width: '100%',
		maxWidth: '1200px',
		margin: '0 auto',
		padding: '0 1rem',
	}],
	['flex-row', {
		display: 'flex',
		flexDirection: 'row',
	}],
	['flex-col', {
		display: 'flex',
		flexDirection: 'column',
	}],
	['grid-responsive', {
		'display': 'grid',
		'gridTemplateColumns': 'repeat(1, 1fr)',
		'gap': '1rem',
		'@screen-sm': {
			gridTemplateColumns: 'repeat(2, 1fr)',
		},
		'@screen-lg': {
			gridTemplateColumns: 'repeat(3, 1fr)',
		},
		'@screen-xl': {
			gridTemplateColumns: 'repeat(4, 1fr)',
		},
	}],
]

// Use in your application
function PageLayout() {
	return (
		<div className={pika('container')}>
			<section className={pika('grid-responsive')}>
				{/* Your content */}
			</section>
		</div>
	)
}
```

### 3. Utility Patterns

Creating utility-like shortcuts:

```tsx
// Define utility shortcuts with a RegExp pattern
shortcuts: [
	[/^m-(\d+)$/, m => ({ margin: `${m[1]}px` }), ['m-4', 'm-8', 'm-16']],
	[/^mt-(\d+)$/, m => ({ marginTop: `${m[1]}px` }), ['mt-4', 'mt-8']],
	[/^mr-(\d+)$/, m => ({ marginRight: `${m[1]}px` }), ['mr-4', 'mr-8']],
	[/^mb-(\d+)$/, m => ({ marginBottom: `${m[1]}px` }), ['mb-4', 'mb-8']],
	[/^ml-(\d+)$/, m => ({ marginLeft: `${m[1]}px` }), ['ml-4', 'ml-8']],

	[/^p-(\d+)$/, m => ({ padding: `${m[1]}px` }), ['p-4', 'p-8', 'p-16']],
	[/^text-(\d+)$/, m => ({ fontSize: `${m[1]}px` }), ['text-14', 'text-16', 'text-20']],
]

// Use in your application
function Component() {
	return (
		<div className={pika('m-16', 'p-8')}>
			<h2 className={pika('text-20', 'mb-8')}>Title</h2>
			<p className={pika('text-16')}>Content</p>
		</div>
	)
}
```

## Best Practices

1. **Naming Consistency**: Use consistent naming patterns for your shortcuts, such as using hyphen-case for static shortcuts and camelCase for more complex ones.

2. **Composition Over Repetition**: Create small, focused shortcuts and compose them together rather than creating many large, overlapping ones.

3. **Provide Autocomplete Options**: Always provide `autocomplete` options for dynamic shortcuts to enhance the developer experience.

4. **Document Your Shortcuts**: Add comments to explain what each shortcut does, particularly for more complex ones.

5. **Don't Overuse Dynamic Shortcuts**: While powerful, too many dynamic shortcuts can increase complexity. Use them selectively for clear patterns.

## Common Shortcut Examples

Here are some common shortcut configuration examples:

```ts
import { defineEngineConfig } from '@pikacss/vite-plugin-pikacss'

export default defineEngineConfig({
	shortcuts: {
		shortcuts: [
			// Layout shortcuts
			['container', {
				width: '100%',
				maxWidth: '1200px',
				margin: '0 auto',
				padding: '0 1rem',
			}],
			['flex-center', {
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
			}],
			['flex-between', {
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
			}],
			['flex-col', {
				display: 'flex',
				flexDirection: 'column',
			}],
			['grid-cols-2', {
				display: 'grid',
				gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
				gap: '1rem',
			}],
			['grid-cols-3', {
				display: 'grid',
				gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
				gap: '1rem',
			}],

			// Component shortcuts
			['card', {
				'padding': '1.5rem',
				'borderRadius': '0.5rem',
				'backgroundColor': 'white',
				'boxShadow': '0 2px 8px rgba(0, 0, 0, 0.1)',
				'@dark': {
					backgroundColor: '#222',
					boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
				},
			}],
			['btn', {
				display: 'inline-flex',
				alignItems: 'center',
				justifyContent: 'center',
				padding: '0.5rem 1rem',
				borderRadius: '0.25rem',
				fontWeight: '500',
				transition: 'all 0.2s',
				cursor: 'pointer',
			}],
			['btn-primary', {
				'__shortcut': 'btn',
				'backgroundColor': 'var(--color-primary)',
				'color': 'white',
				':hover': {
					backgroundColor: 'var(--color-primary-dark)',
				},
			}],

			// Utility shortcuts
			[/^m-(\d+)$/, m => ({ margin: `${m[1]}px` }), ['m-4', 'm-8', 'm-16', 'm-24']],
			[/^p-(\d+)$/, m => ({ padding: `${m[1]}px` }), ['p-4', 'p-8', 'p-16', 'p-24']],
			[/^text-(\d+)$/, m => ({ fontSize: `${m[1]}px` }), ['text-14', 'text-16', 'text-20', 'text-24']],
		]
	}
})
