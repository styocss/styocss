---
title: Keyframes
description: What is the StyoCSS Keyframes feature.
outline: deep
---

# Keyframes

StyoCSS provides a powerful keyframes system that allows you to define and use CSS animations throughout your styles. This feature helps you create smooth and reusable animations with proper autocomplete support.

## Configuration

The keyframes system can be configured through the `keyframes` option in your engine configuration:

```ts
interface CorePluginConfig {
	keyframes?: KeyframesConfig[]
}

type KeyframesConfig =
	| string
	| [name: string, frames?: Frames, autocomplete?: string[]]
	| { name: string, frames?: Frames, autocomplete?: string[] }

interface Frames {
	from: Properties
	to: Properties
	[K: `${number}%`]: Properties
}
```

## Usage

### Basic Keyframes

You can define simple keyframe animations:

```ts
const config = {
	keyframes: [
		['fade-in', {
			from: { opacity: 0 },
			to: { opacity: 1 }
		}]
	]
}
```

### Keyframes with Autocomplete

You can configure how keyframes are used in autocomplete:

```ts
const config = {
	keyframes: [
		['slide-in', {
			from: { transform: 'translateX(-100%)' },
			to: { transform: 'translateX(0)' },
		}, [
			'slide-in 0.3s ease-in-out',
			'slide-in 1s ease-in-out infinite',
			'slide-in 0.5s ease-in-out forwards'
		]]
	]
}
```

### Using Keyframes

Keyframes can be used in your styles using the `animation` or `animationName` property:

```ts
styo({
	animation: 'fade-in 1s ease-in-out'
})

styo({
	animationName: 'fade-in',
	animationDuration: '1s',
	animationTimingFunction: 'ease-in-out'
})
```

## Frame Definition

### Basic Frames

The `Frames` interface supports three types of frames:

1. `from`: Starting state (0%)
2. `to`: Ending state (100%)
3. Percentage-based frames: Any percentage between 0% and 100%

```ts
const config = {
	keyframes: [
		['bounce', {
			'from': { transform: 'translateY(0)' },
			'50%': { transform: 'translateY(-20px)' },
			'to': { transform: 'translateY(0)' }
		}]
	]
}
```

### Properties in Frames

Each frame can contain any valid CSS properties:

```ts
const config = {
	keyframes: [
		['complex-animation', {
			'from': {
				transform: 'scale(1)',
				opacity: 1,
				backgroundColor: '#ff0000'
			},
			'50%': {
				transform: 'scale(1.5)',
				opacity: 0.5,
				backgroundColor: '#00ff00'
			},
			'to': {
				transform: 'scale(1)',
				opacity: 1,
				backgroundColor: '#ff0000'
			}
		}]
	]
}
```

## Integration with Autocomplete

The keyframes system is integrated with StyoCSS's autocomplete feature:

- Keyframe names are automatically added to `animation-name` suggestions
- Animation timing functions are suggested in the autocomplete list
- The system provides proper TypeScript support for all keyframe-related properties

## Example Usage

```ts
const config = {
	keyframes: [
		// Basic fade animation
		['fade', {
			from: { opacity: 0 },
			to: { opacity: 1 }
		}],

		// Complex animation with timing function
		['slide-in', {
			from: { transform: 'translateX(-100%)' },
			to: { transform: 'translateX(0)' }
		}, [
			'slide-in 0.3s ease-in-out',
			'slide-in 1s ease-in-out infinite',
			'slide-in 0.5s ease-in-out forwards'
		]],

		// Object syntax with multiple frames
		{
			name: 'bounce',
			frames: {
				'from': { transform: 'translateY(0)' },
				'50%': { transform: 'translateY(-20px)' },
				'to': { transform: 'translateY(0)' }
			},
			autocomplete: [
				'bounce 0.3s ease-in-out',
				'bounce 1s ease-in-out infinite',
				'bounce 0.5s ease-in-out forwards'
			]
		}
	]
}
```

This configuration allows you to use animations like:

```ts
styo({
	// Simple fade animation
	animation: 'fade 1s',

	// Complex animation with timing function
	animation: 'slide-in 0.5s ease-in-out',

	// Bounce animation
	animation: 'bounce 1s ease-in-out infinite'
})
```

## Automatic Usage Detection

StyoCSS automatically detects which keyframes are actually used in your styles and only includes them in the final CSS output. This helps keep your CSS bundle size optimized.

## TypeScript Support

The keyframes system provides full TypeScript support:

- Type safety for keyframe names
- Autocomplete for animation properties
- Property value validation
- Custom property type definitions

This ensures that you get accurate suggestions and type checking while developing your animations.
