---
title: Important Flag
description: Learn how to use the important flag in PikaCSS
outline: deep
---

# Important Flag

The `!important` CSS declaration is a powerful feature that increases a property's specificity, allowing it to override other styles. PikaCSS provides a convenient way to apply `!important` to your styles through its built-in important functionality.

## How Important Works in PikaCSS

In PikaCSS, the important flag can be applied in two ways:

1. **Globally**: Setting a default for all style properties
2. **Locally**: Applying to specific style definitions

The important system works by adding the `!important` declaration to each CSS property value, making it take precedence over other styles with the same specificity.

## Configuring Important

### Global Configuration

You can configure the default important behavior in your `pika.config.ts` file:

```ts
import { defineEngineConfig } from '@pikacss/vite-plugin-pikacss'

export default defineEngineConfig({
	important: {
		default: false, // Set to true to make all styles important by default
	}
})
```

### Important Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `default` | boolean | `false` | When set to `true`, all CSS properties will have `!important` added by default |

## Using Important in Styles

You can apply the important flag to specific style definitions using the `__important` property:

```ts
// Making all properties in this style definition important
pika({
	__important: true,
	color: 'blue',
	fontSize: '16px',
	margin: '10px',
})
```

The above code will generate CSS like:

```css
.xxx { color: blue !important; }
.xxx { font-size: 16px !important; }
.xxx { margin: 10px !important; }
```

### Overriding Global Important Setting

If you've set `important.default: true` globally, you can disable it for specific style definitions:

```ts
// Global configuration has important.default: true

// Disabling important for this specific style
pika({
	__important: false, // Overrides the global setting
	color: 'blue',
	fontSize: '16px',
})
```

## Working with Other Features

The important flag works seamlessly with other PikaCSS features:

### With Selectors

```ts
pika({
	'__important': true,
	'color': 'black',
	':hover': {
		color: 'blue', // This will also have !important
	},
})
```

### With Shortcuts

```ts
// Define a shortcut
shortcuts: [
	['text-bold', {
		fontWeight: 'bold',
		fontSize: '1.2em',
	}],
]

// Use with important
pika({
	__important: true,
	__shortcut: 'text-bold', // All properties from the shortcut will have !important
	color: 'blue',
})
```

## Best Practices

While the `!important` flag is powerful, it can lead to CSS specificity issues if overused. Here are some best practices:

1. **Use sparingly**: Only apply important when necessary to override specific styles
2. **Consider alternatives**: Before using important, check if you can solve the issue with more specific selectors
3. **Document usage**: If you set `important.default: true` globally, document this for your team
4. **Debug specificity issues**: If you're relying heavily on important flags, it might indicate a need to refactor your CSS architecture

## Real World Use Cases

### 1. Overriding Third-party Styles

When integrating with third-party libraries or frameworks that apply their own styles:

```ts
// Ensure your styles override third-party CSS
pika({
	__important: true,
	padding: '0', // Will override any external padding
	margin: '0', // Will override any external margin
})
```

### 2. Utility Classes

Creating utility classes that should always apply regardless of other styles:

```ts
// Define utility shortcuts with important flag
shortcuts: [
	['hidden', {
		__important: true,
		display: 'none',
	}],
	['full-width', {
		__important: true,
		width: '100%',
	}],
]

// Use in your application
const styles = {
	hiddenElement: pika('hidden'),
	fullWidthContainer: pika('full-width'),
}
```

### 3. Theme Overrides

Ensuring theme styles take precedence:

```ts
pika({
	'color': 'var(--text-color)',
	'@dark': {
		__important: true, // Make dark mode styles take precedence
		color: 'var(--dark-text-color)',
	},
})
```

## Conclusion

The important flag in PikaCSS provides a clean and straightforward way to apply the CSS `!important` declaration. By offering both global and local control, PikaCSS makes it easy to manage specificity in your styles while maintaining a clean and maintainable codebase.
