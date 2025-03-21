---
title: Shortcut
description: What is the StyoCSS Shortcut feature.
outline: deep
---

# Shortcut

StyoCSS provides a powerful shortcut system that allows you to create reusable style combinations and patterns. This feature helps you write more concise and maintainable styles by defining shortcuts that expand into multiple style properties.

## Configuration

The shortcut system can be configured through the `shortcuts` option in your engine configuration:

```ts
type ShortcutConfig =
	| string
	| [shortcut: RegExp, value: (matched: RegExpMatchArray) => Awaitable<Arrayable<StyleItem>>, autocomplete?: Arrayable<string>]
	| {
		shortcut: RegExp
		value: (matched: RegExpMatchArray) => Awaitable<Arrayable<StyleItem>>
		autocomplete?: Arrayable<string>
	}
	| [shortcut: string, value: Arrayable<StyleItem>]
	| {
		shortcut: string
		value: Arrayable<StyleItem>
	}
```

## Usage

### Static Shortcuts

You can define static shortcuts that map to specific style combinations:

```ts
const config = {
	shortcuts: [
		['flex-center', {
			'display': 'flex',
			'align-items': 'center',
			'justify-content': 'center'
		}],
		['absolute-center', {
			position: 'absolute',
			top: '50%',
			left: '50%',
			transform: 'translate(-50%, -50%)'
		}]
	]
}
```

### Dynamic Shortcuts

For more complex scenarios, you can use regular expressions and functions to create dynamic shortcuts:

```ts
const config = {
	shortcuts: [
		[/^m-(\d+)$/, match => ({
			margin: `${match[1]}px`
		})],
		[/^p-(\d+)$/, match => ({
			padding: `${match[1]}px`
		})]
	]
}
```

### Using Shortcuts

You can use shortcuts in your styles in two ways:

1. As a string in style items:
```ts
styo('flex-center', 'm-16')
```

2. Using the `__shortcut` property:
```ts
styo({
	__shortcut: ['flex-center', 'm-16'] // Apply multiple shortcuts in order
	// Later shortcuts override earlier ones for conflicting properties
	// For selectors: same selectors override, different ones coexist
})
```

## Integration with Autocomplete

The shortcut system is integrated with StyoCSS's autocomplete feature:

- Static shortcuts are automatically added to the autocomplete suggestions
- Dynamic shortcuts can specify custom autocomplete values
- The system maintains type safety for shortcut usage

## Example Usage

```ts
const config = {
	shortcuts: [
		// Static shortcuts
		['flex-center', {
			'display': 'flex',
			'align-items': 'center',
			'justify-content': 'center'
		}],

		// Dynamic shortcuts with autocomplete
		[/^m-(\d+)$/, match => ({
			margin: `${match[1]}px`
		}), ['m-4', 'm-8', 'm-16']],

		// Object syntax
		{
			shortcut: 'card',
			value: {
				'padding': '1rem',
				'border-radius': '0.5rem',
				'box-shadow': '0 2px 4px rgba(0,0,0,0.1)'
			}
		},

		// Shortcut composed of other shortcuts and properties
		['card-center', [
			'card', // Reuse the card shortcut
			'flex-center', // Reuse the flex-center shortcut
			{
				// Add additional properties
				backgroundColor: '#fff',
				color: '#333'
			}
		]]
	]
}
```

This configuration allows you to use shortcuts like:

```ts
styo('flex-center', 'm-16', 'card')
```

The shortcuts will be expanded into their corresponding style properties, and you'll get proper autocomplete support in your IDE.
