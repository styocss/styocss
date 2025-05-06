---
title: Keyframes
description: Learn how to use keyframes in PikaCSS
outline: deep
---

# Keyframes

CSS animations are essential for creating dynamic and engaging web experiences. PikaCSS provides a robust way to define and manage CSS `@keyframes` animations with proper TypeScript support and automatic generation of optimized CSS.

## How Keyframes Work in PikaCSS

In PikaCSS, keyframes animations are defined in your configuration and automatically processed to generate CSS `@keyframes` rules. This approach offers several advantages:

- Type-safe animation definitions with TypeScript
- Automatic pruning of unused animations to minimize CSS output
- Simplified syntax for defining complex animations
- Auto-completion support for animation properties

## Defining Keyframes

You can define keyframes in your `pika.config.ts` file:

```ts
import { defineEngineConfig } from '@pikacss/vite-plugin-pikacss'

export default defineEngineConfig({
	keyframes: {
		keyframes: [
			// Basic fade animation
			['fade', {
				from: { opacity: 0 },
				to: { opacity: 1 }
			}],

			// Multi-step animation
			['pulse', {
				'0%': { transform: 'scale(1)' },
				'50%': { transform: 'scale(1.1)' },
				'100%': { transform: 'scale(1)' }
			}],

			// With autocomplete suggestions for common usage
			['bounce', {
				'0%, 100%': { transform: 'translateY(0)' },
				'50%': { transform: 'translateY(-20px)' }
			}, ['bounce 1s infinite ease-in-out']]
		]
	}
})
```

## Keyframes Configuration Options

Each keyframe animation can be defined with the following options:

```ts
// Basic format - array syntax
['animation-name', framesObject, autocompleteArray, pruneUnusedBoolean]
```

| Option | Description |
|--------|-------------|
| `name` | The name of the animation to be used with `animation` or `animation-name` properties |
| `frames` | An object defining the keyframes with percentage or keywords (`from`/`to`) as keys |
| `autocomplete` | Array of animation shorthand strings for autocomplete suggestions (optional) |
| `pruneUnused` | Whether to remove unused animations from the final CSS (defaults to `true`) |

### Frames Object

The frames object represents the different steps of your animation:

```ts
const frames = {
	// You can use percentage strings
	'0%': { transform: 'translateX(0)' },
	'25%': { opacity: 0.5 },
	'100%': { transform: 'translateX(100px)' },

	// Or use the from/to keywords
	'from': { opacity: 0 },
	'to': { opacity: 1 },

	// You can also combine percentages
	'0%, 100%': { transform: 'scale(1)' }
}
```

## Using Keyframes in Styles

Once defined, you can use your keyframes in your styles:

```ts
// Using keyframes in styles
pika({
	// With animation-name property
	animationName: 'fade',
	animationDuration: '0.3s',
	animationTimingFunction: 'ease-in-out',

	// Or with the animation shorthand
	animation: 'pulse 2s infinite',

	// Multiple animations
	animation: 'fade 0.3s ease-in-out, pulse 2s infinite'
})
```

## Keyframes with TypeScript Support

When you define keyframes in your configuration, PikaCSS automatically generates TypeScript definitions, providing autocomplete and type checking:

```ts
// TypeScript will show autocomplete for your defined keyframes
pika({
	animationName: 'fade', // ✓ Valid - autocomplete works
	animationName: 'unknown-animation' // ✗ Error - unknown animation
})
```

## Keyframes Pruning

By default, PikaCSS performs "pruning" of unused keyframes, meaning that only animations actually used in your styles will be included in the final CSS output. This helps to minimize your CSS bundle size.

You can disable this behavior globally or per animation:

```ts
export default defineEngineConfig({
	keyframes: {
		// Disable pruning globally
		pruneUnused: false,

		keyframes: [
			// This animation will be included even if unused
			['always-included', { from: { opacity: 0 }, to: { opacity: 1 } }, [], false],

			// This animation follows the global setting (pruned if unused)
			['maybe-included', { from: { opacity: 0 }, to: { opacity: 1 } }]
		]
	}
})
```

## Adding Keyframes Programmatically

You can also add keyframes programmatically using the Engine API:

```ts
import { createEngine } from '@pikacss/core'

const engine = createEngine()

// Add keyframes
engine.extra.keyframes.add(
	['dynamic-fade', {
		from: { opacity: 0 },
		to: { opacity: 1 }
	}],
	['dynamic-slide', {
		from: { transform: 'translateX(-100%)' },
		to: { transform: 'translateX(0)' }
	}, ['dynamic-slide 0.5s ease-out']]
)
```

## Best Practices

1. **Use Meaningful Names**: Choose descriptive names for your animations that indicate their purpose or effect.

2. **Optimize Animation Performance**: Focus on animating properties that are cheaper for browsers to render (transform, opacity) instead of properties that trigger layout recalculations.

3. **Provide Autocomplete Suggestions**: Include common variants of your animations in the autocomplete array to improve developer experience.

4. **Remove Unused Animations**: Keep the pruning feature enabled to minimize your CSS output.

5. **Consider Accessibility**: Be mindful of users who prefer reduced motion by providing alternatives or using the `prefers-reduced-motion` media query.

## Common Animation Examples

### Fade Animations

```ts
export default defineEngineConfig({
	keyframes: {
		keyframes: [
			['fade-in', {
				from: { opacity: 0 },
				to: { opacity: 1 }
			}, ['fade-in 0.3s ease-in']],

			['fade-out', {
				from: { opacity: 1 },
				to: { opacity: 0 }
			}, ['fade-out 0.3s ease-out']]
		]
	}
})
```

### Transform Animations

```ts
export default defineEngineConfig({
	keyframes: {
		keyframes: [
			['slide-in-right', {
				from: { transform: 'translateX(100%)', opacity: 0 },
				to: { transform: 'translateX(0)', opacity: 1 }
			}, ['slide-in-right 0.5s ease-out']],

			['scale-up', {
				from: { transform: 'scale(0.8)', opacity: 0 },
				to: { transform: 'scale(1)', opacity: 1 }
			}, ['scale-up 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)']]
		]
	}
})
```

### Looping Animations

```ts
export default defineEngineConfig({
	keyframes: {
		keyframes: [
			['spin', {
				from: { transform: 'rotate(0deg)' },
				to: { transform: 'rotate(360deg)' }
			}, ['spin 1s linear infinite']],

			['pulse', {
				'0%': { transform: 'scale(1)' },
				'50%': { transform: 'scale(1.1)' },
				'100%': { transform: 'scale(1)' }
			}, ['pulse 1.5s ease-in-out infinite']]
		]
	}
})
```

### Attention-Seeking Animations

```ts
export default defineEngineConfig({
	keyframes: {
		keyframes: [
			['shake', {
				'0%, 100%': { transform: 'translateX(0)' },
				'10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-10px)' },
				'20%, 40%, 60%, 80%': { transform: 'translateX(10px)' }
			}, ['shake 0.8s ease-in-out']],

			['bounce', {
				'0%, 20%, 50%, 80%, 100%': { transform: 'translateY(0)' },
				'40%': { transform: 'translateY(-30px)' },
				'60%': { transform: 'translateY(-15px)' }
			}, ['bounce 1s infinite']]
		]
	}
})
```
