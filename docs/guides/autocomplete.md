---
title: Autocomplete
description: What is the PikaCSS Autocomplete feature.
outline: deep
---

# Autocomplete

PikaCSS provides a powerful autocomplete system that enhances your development experience by offering intelligent suggestions for:

- Selectors
- Style item strings
- Extra properties
- Extra CSS properties
- Property values
- CSS property values

## Configuration

The autocomplete system can be configured through the `autocomplete` option in your engine configuration:

```ts
interface AutocompleteConfig {
	selectors?: string[]
	styleItemStrings?: string[]
	extraProperties?: string[]
	extraCssProperties?: string[]
	properties?: [property: string, tsType: Arrayable<string>][]
	cssProperties?: [property: string, value: Arrayable<string | number>][]
}
```

## Features

### Selectors
Autocomplete suggestions for CSS selectors, making it easier to write complex selectors with proper syntax.

### Style Item Strings
Suggestions for style item strings, helping you write consistent and valid style declarations.

### Extra Properties
Custom properties that can be added to enhance the autocomplete system with domain-specific suggestions.

### Extra CSS Properties
Additional CSS properties that can be included in the autocomplete suggestions.

### Property Values
TypeScript type definitions for property values, ensuring type safety and providing accurate suggestions.

### CSS Property Values
Predefined values for CSS properties, making it easier to use standard CSS values.

## TypeScript Support

PikaCSS generates TypeScript declaration files that include autocomplete information, providing:

- Type safety for selectors
- Property value suggestions
- CSS property value validation
- Custom property support

This integration ensures that you get accurate suggestions and type checking while developing your styles.
