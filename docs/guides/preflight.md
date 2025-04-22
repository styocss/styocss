---
title: Preflight
description: What is the PikaCSS Preflight feature.
outline: deep
---

# Preflight

PikaCSS provides a powerful preflight system that allows you to inject global CSS styles before your atomic styles are rendered. This feature is particularly useful for:

- Setting up CSS custom properties (variables)
- Defining global keyframe animations
- Applying base styles
- Resetting browser defaults

## Configuration

The preflight system can be configured through the `preflights` option in your engine configuration:

```ts
interface EngineConfig {
	preflights?: PreflightConfig[]
}

type PreflightConfig = string | PreflightFn
type PreflightFn = (engine: Engine) => string
```

## Usage

### String-based Preflights

You can provide CSS strings directly:

```ts
const config = {
	preflights: [
		`
        :root {
            --primary-color: #007bff;
            --secondary-color: #6c757d;
        }
        `
	]
}
```

### Function-based Preflights

For more dynamic preflights, you can use functions that have access to the engine instance:

```ts
const config = {
	preflights: [
		(engine) => {
			// Access engine's configuration and state
			return `/* Custom preflight styles */`
		}
	]
}
```

## Rendering Order

Preflights are rendered before atomic styles in the final CSS output:

```css
/* Preflight styles */
:root { ... }
@keyframes ... { ... }

/* Atomic styles */
.atomic-class-1 { ... }
.atomic-class-2 { ... }
```

This ensures that your global styles and definitions are available before any atomic styles are applied.
