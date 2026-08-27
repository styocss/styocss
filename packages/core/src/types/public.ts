import type * as CSS from '../generated/csstype'
import type { Nullish, UnionString } from './utils'

/**
 * Mapping of CSS custom property names (starting with `--`) to their string values.
 * @internal
 *
 * @remarks Provides type-safe custom property support in style definitions. Any key matching `--*` is accepted with a `UnionString` value.
 *
 * @example
 * ```ts
 * const vars: CSSVariables = { '--color-primary': 'blue', '--spacing': '8px' }
 * ```
 */
export interface CSSVariables { [K: (`--${string}` & {})]: UnionString }
/**
 * Unified CSS property map combining standard CSS properties (camelCase and hyphen-case), hyphenated properties, and custom properties.
 * @internal
 *
 * @remarks Serves as the ground-truth type for raw CSS property lookups. Used internally when constructing property value types and determining valid CSS property names.
 *
 * @example
 * ```ts
 * const props: CSSProperties = { color: 'red', '--my-var': 'blue' }
 * ```
 */
export interface CSSProperties extends CSS.Properties, CSS.PropertiesHyphen, CSSVariables {}
/**
 * Union of all valid CSS property name strings, including standard properties, vendor-prefixed properties, and custom properties.
 *
 * @remarks Extracted from the keys of `CSSProperties`. Useful for functions that accept a property name as a parameter.
 *
 * @example
 * ```ts
 * function getDefault(prop: CSSProperty): string { return '' }
 * ```
 */
export type CSSProperty = Extract<keyof CSSProperties, string>

/**
 * A CSS property value that supports single values, `[value, fallback[]]` tuples for multi-value fallbacks, or nullish to unset/remove the property.
 *
 * @typeParam T - The base value type (usually `string` or a union of literal strings).
 *
 * @remarks When passed as a tuple, the first element is the primary value and the second is an array of fallback values rendered before it (for CSS fallback ordering). Passing `null` or `undefined` removes the property during optimization.
 *
 * @example
 * ```ts
 * const single: PropertyValue<string> = 'red'
 * const withFallback: PropertyValue<string> = ['oklch(0.5 0.2 240)', ['blue']]
 * const remove: PropertyValue<string> = null
 * ```
 */
export type PropertyValue<T> = T | [value: T, fallback: T[]] | Nullish

type Properties_CSS_Camel = CSS.PropertiesInput
type Properties_CSS_Hyphen = CSS.PropertiesHyphenInput
type Properties_CSS_Vars = {
	[K in `--${string}` & {}]?: PropertyValue<UnionString>
}

/**
 * The Core property map accepted before generated Typegen overlays domain/plugin
 * contributions. Generated documents compose directives and extension-owned
 * property/value surfaces on top of this baseline.
 */
export interface Properties extends Properties_CSS_Camel, Properties_CSS_Hyphen, Properties_CSS_Vars {}

type CSSPseudos = CSS.CSSPseudos
/**
 * Union of valid CSS selector strings for nested style definitions, including CSS at-rules and pseudo-selectors (prefixed with `$`).
 *
 * @remarks In PikaCSS, pseudo-selectors are prefixed with `$` instead of `:` to avoid collisions with CSS property names in object keys (e.g. `$:hover` instead of `:hover`).
 *
 * @example
 * ```ts
 * const selector: CSSSelector = '$:hover'
 * const atRule: CSSSelector = '@media (min-width: 768px)'
 * ```
 */
export type CSSSelector = CSS.AtRules.Nested | CSSPseudos
/**
 * Union of all selector strings accepted in style definitions, including custom selectors from plugins, standard CSS selectors, and arbitrary strings.
 * @internal
 *
 * @remarks Combines open-ended `UnionString` authoring with built-in `CSSSelector` (at-rules + `$`-prefixed pseudos). Generated configured-selector members are layered on by Typegen rather than global augmentation.
 *
 * @example
 * ```ts
 * const sel: Selector = '$:hover'
 * const custom: Selector = 'dark' // plugin-defined selector
 * ```
 */
export type Selector = UnionString | CSSSelector

/**
 * A nested style definition where keys are selector strings and values are property values, property maps, nested definitions, or arrays of style items.
 *
 * @remarks Enables nesting selectors within a style definition to express pseudo-classes, media queries, and other combinators. The engine recursively walks this structure during extraction.
 *
 * @example
 * ```ts
 * const map: StyleDefinitionMap = {
 *   '$:hover': { color: 'blue' },
 *   '@media (min-width: 768px)': { fontSize: '18px' },
 * }
 * ```
 */
export type StyleDefinitionMap = {
	[K in Selector]?: PropertyValue<UnionString> | Properties | StyleDefinition | StyleItem[] | undefined
}
/**
 * A style definition passed to `pika()`, representing either a flat CSS property map or a nested selector-keyed structure (or both).
 *
 * @remarks This is the primary input type for the `pika()` function. A flat `Properties` map defines atomic styles directly. A `StyleDefinitionMap` nests properties under selector keys for conditional styling.
 *
 * @example
 * ```ts
 * // Flat
 * const flat: StyleDefinition = { color: 'red', fontSize: '16px' }
 * // Nested
 * const nested: StyleDefinition = { '$:hover': { color: 'blue' } }
 * ```
 */
export type StyleDefinition = Properties | StyleDefinitionMap

/**
 * An individual item in a style item list: either a string reference (shortcut name or raw class), a style definition object, or a combination of shortcut union strings.
 *
 * @remarks When `pika()` receives an array of style items, string items are resolved via the shortcuts resolver while object items are treated as inline style definitions. Unresolved strings are passed through as class names.
 *
 * @example
 * ```ts
 * const item: StyleItem = 'btn-primary'      // shortcut reference
 * const itemDef: StyleItem = { color: 'red' } // inline style
 * ```
 */
export type StyleItem
	=	| UnionString
		| StyleDefinition
