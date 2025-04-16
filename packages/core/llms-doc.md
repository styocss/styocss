# Core Library Documentation

## 1. Overview

This library provides a highly extensible and modular engine for managing atomic styles, CSS properties, and dynamic style definitions. It is designed to support advanced features like autocomplete, variable management, keyframes, and shortcuts, making it ideal for building CSS-in-JS solutions or atomic CSS frameworks.

### Key Features:
- **Atomic Style Management**: Efficiently generate and manage atomic CSS rules.
- **Dynamic Style Definitions**: Support for nested and dynamic style definitions.
- **Autocomplete Support**: Enhance developer experience with autocompletion for selectors, properties, and values.
- **Plugin System**: Fully extensible via plugins for custom behavior.
- **Preflight Styles**: Automatically inject global styles like variables and keyframes.

---

## 2. Installation and Configuration

### Installation
To install the library, use the following command:
```bash
npm install @core/engine
```

### Dependencies
- TypeScript for type safety.
- `csstype` for CSS property type definitions.

### Configuration
The engine is configured using an `EngineConfig` object. Key configuration options include:
- `prefix`: Prefix for atomic style names.
- `defaultSelector`: Default selector format.
- `plugins`: Array of plugins to extend functionality.
- `variables`: Define CSS variables.
- `keyframes`: Define keyframe animations.
- `shortcuts`: Define reusable style shortcuts.

Example configuration:
```typescript
import { createEngine } from '@core/engine'

const engine = await createEngine({
	prefix: 'a-',
	defaultSelector: '.&',
	variables: [
		{ name: 'primary-color', value: '#3498db' },
	],
	keyframes: [
		{ name: 'fade-in', frames: { from: { opacity: 0 }, to: { opacity: 1 } } },
	],
})
```

---

## 3. Core Features and API Reference

### 3.1 Engine
#### `createEngine(config: EngineConfig): Promise<Engine>`
Creates an engine instance with the provided configuration.

#### `Engine.use(...itemList: StyleItem[]): Promise<string[]>`
Registers style items and returns their atomic class names.

#### `Engine.renderStyles(): string`
Generates the final CSS string for all registered styles.

---

### 3.2 Plugins
#### `defineEnginePlugin(plugin: EnginePlugin): EnginePlugin`
Defines a custom plugin for the engine.

#### Built-in Plugins:
- **Variables**: Manage CSS variables.
- **Keyframes**: Define and manage keyframe animations.
- **Shortcuts**: Create reusable style shortcuts.
- **Selectors**: Resolve and transform selectors.
- **Important**: Add `!important` to style rules.

---

### 3.3 Utilities
#### `toKebab(str: string): string`
Converts camelCase strings to kebab-case.

#### `numberToChars(num: number): string`
Generates a unique string representation for a number.

---

## 4. Usage Examples

### Example 1: Basic Atomic Style Usage
```typescript
const engine = await createEngine({ prefix: 'a-' })
const classNames = await engine.use({ color: 'red', fontSize: '16px' })
console.log(classNames) // ['a-0', 'a-1']
console.log(engine.renderStyles())
// Output:
// .a-0 { color: red; }
// .a-1 { font-size: 16px; }
```

### Example 2: Using Variables and Keyframes
```typescript
const engine = await createEngine({
	variables: [{ name: 'primary-color', value: '#3498db' }],
	keyframes: [{ name: 'fade-in', frames: { from: { opacity: 0 }, to: { opacity: 1 } } }],
})
console.log(engine.renderStyles())
// Output:
// :root { --primary-color: #3498db; }
// @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
```

---

## 5. Notes and Best Practices

### Important Notes:
- Ensure all plugins are properly ordered using the `order` property (`pre`, `post`, or `undefined`).
- Use the `defaultSelector` option to customize how atomic styles are applied.

### Best Practices:
- **Optimize Performance**: Use `Engine.renderStyles()` sparingly to avoid unnecessary recomputations.
- **Leverage Plugins**: Extend functionality with custom plugins for specific use cases.
- **Autocomplete**: Configure `autocomplete` options to improve developer experience in IDEs.

```typescript
// Example: Adding autocomplete for custom properties
appendAutocompleteExtraProperties(config, 'custom-property')
```

---

This documentation serves as a comprehensive reference for understanding and utilizing the core library effectively.
