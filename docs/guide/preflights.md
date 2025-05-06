---
title: Preflights
description: Learn how to use preflights in PikaCSS
outline: deep
---

# Preflights

Preflights are global CSS styles that are injected before atomic styles in your generated CSS output. They're useful for defining:

- CSS variables
- Global reset styles
- Base styles for elements
- CSS animations and keyframes
- Browser normalization

## How Preflights Work

In PikaCSS, preflights are processed and injected before any atomic CSS styles. This ensures that your global styles and normalizations are applied first, providing a consistent base for your application styles.

## Adding Preflights

You can add preflights in your `pika.config.ts` file:

```ts
import { defineEngineConfig } from '@pikacss/vite-plugin-pikacss'

export default defineEngineConfig({
	preflights: [
		// Static CSS string
		`:root {
			--color-primary: #ff007f;
			--font-sans: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
		}`,

		// CSS reset example
		`*,
		*::before,
		*::after {
			box-sizing: border-box;
			margin: 0;
			padding: 0;
		}`,

		// Base styles
		`body {
			font-family: var(--font-sans);
			line-height: 1.5;
			-webkit-font-smoothing: antialiased;
		}`,

		// Dynamic preflight with engine access
		(engine) => {
			return `/* Generated at: ${new Date().toISOString()} */`
		}
	]
})
```

## Types of Preflights

PikaCSS supports two types of preflight configurations:

### 1. Static CSS Strings

Use a plain string containing valid CSS to define static global styles:

```ts
preflights: [
	`:root {
		--spacing-sm: 0.5rem;
		--spacing-md: 1rem;
		--spacing-lg: 2rem;
	}`,
]
```

### 2. Dynamic Functions

Use a function to generate CSS dynamically. This function receives the PikaCSS engine instance and a formatting boolean:

```ts
preflights: [
	(engine, isFormatted) => {
		// Generate CSS dynamically
		return `/* Custom preflight generated for ${process.env.NODE_ENV} */
		:root {
			--app-version: '1.0.0';
		}`
	}
]
```

The `isFormatted` parameter indicates whether the CSS should be formatted for development (with indentation) or minified for production.

## Common Use Cases

### 1. CSS Variables

Define global CSS variables for consistent design tokens:

```ts
preflights: [
	`:root {
		--color-primary: #4f46e5;
		--color-secondary: #818cf8;
		--color-text: #111827;
		--color-background: #ffffff;
	}`,

	// Dark mode variables
	`@media (prefers-color-scheme: dark) {
		:root {
			--color-text: #f9fafb;
			--color-background: #111827;
		}
	}`
]
```

### 2. CSS Reset/Normalize

Add CSS reset or normalization styles:

```ts
preflights: [
	`*,
	*::before,
	*::after {
		box-sizing: border-box;
	}

	body, h1, h2, h3, h4, p, figure, blockquote, dl, dd {
		margin: 0;
	}

	html:focus-within {
		scroll-behavior: smooth;
	}

	body {
		min-height: 100vh;
		text-rendering: optimizeSpeed;
		line-height: 1.5;
	}`
]
```

### 3. Global Animations

Define reusable keyframes animations:

```ts
preflights: [
	`@keyframes fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	@keyframes slide-in {
		from { transform: translateY(20px); opacity: 0; }
		to { transform: translateY(0); opacity: 1; }
	}`
]
```

## Adding Preflights Programmatically

You can also add preflights programmatically using the Engine API:

```ts
import { createEngine } from '@pikacss/core'

const engine = createEngine()

// Add a preflight
engine.addPreflight(`:root { --dynamic-color: red; }`)

// Add a dynamic preflight
engine.addPreflight((engine) => {
	return `.custom-element { background-color: #f0f0f0; }`
})
```

## Best Practices

1. **Keep It Minimal**: Only include truly global styles in preflights to avoid increasing your CSS bundle size unnecessarily.

2. **Use CSS Variables**: Define design tokens as CSS variables in preflights for consistent styling across your application.

3. **Order Matters**: Preflights are injected in the order they are defined, so place more general styles before specific ones.

4. **Environment-Specific Styles**: Use dynamic functions to generate different styles based on the environment.

5. **Avoid Conflicts**: Be careful not to define styles that might conflict with your atomic styles or third-party libraries.
