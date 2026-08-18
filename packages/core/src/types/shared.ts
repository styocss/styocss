import type { Properties, PropertyValue, StyleDefinition, StyleItem } from './public'
import type { Nullish } from './utils'

/**
 * Module augmentation interface that plugins extend to inject type-level information (autocomplete maps, property unions, selector unions) into the core type system.
 *
 * @remarks Plugins declare `module '@pikacss/core' { interface PikaAugment { ... } }` to contribute types. At resolution time, the engine reads members such as `Autocomplete`, `Properties`, `Selector`, `StyleDefinition`, and `StyleItem` to narrow the public API type signatures.
 *
 * @example
 * ```ts
 * declare module '@pikacss/core' {
 *   interface PikaAugment {
 *     Autocomplete: DefineAutocomplete<{ Selector: 'dark' | 'light', Shortcut: never, Layer: never, PropertyValue: never, CSSPropertyValue: never }>
 *   }
 * }
 * ```
 */
export interface PikaAugment {}

/**
 * Runtime normalization input accepted inside the engine.
 * @internal
 *
 * @remarks This type is deliberately broader than the public `Properties` authoring contract. The extractor tolerates arbitrary JavaScript numbers at runtime and normalizes them to strings so callers that bypass or erase the public types do not make the engine fragile. Do not infer `pika()` value support from this alias: generated public CSS types keep `<number>`, `<integer>`, percentages, custom properties, and other numeric grammars string-backed. A numeric `0` is admitted only through generated length-like positions where unitless zero is unambiguous.
 *
 * @example
 * ```ts
 * const val: InternalPropertyValue = ['red', ['blue', 'green']]
 * const runtimeZero: InternalPropertyValue = 0
 * const runtimeNumber: InternalPropertyValue = 0.5 // tolerated internally; not a public pika() authoring value
 * ```
 */
export type InternalPropertyValue = PropertyValue<string | number>

/**
 * Internal alias for the resolved `Properties` type used inside the engine.
 * @internal
 *
 * @remarks Mirrors the public `Properties` interface so internal code does not directly import from the public types barrel.
 *
 * @example
 * ```ts
 * const props: InternalProperties = { color: 'red', 'font-size': '16px' }
 * ```
 */
export type InternalProperties = Properties

/**
 * Internal alias for the resolved `StyleDefinition` type used inside the engine.
 * @internal
 *
 * @remarks A style definition is either a flat property map or a nested selector-keyed structure. Internal code references this alias instead of the public type.
 *
 * @example
 * ```ts
 * const def: InternalStyleDefinition = {
 *   color: 'red',
 *   '$:hover': { color: 'blue' },
 * }
 * ```
 */
export type InternalStyleDefinition = StyleDefinition

/**
 * Internal alias for the resolved `StyleItem` type used inside the engine.
 * @internal
 *
 * @remarks A style item is a string (class name / shortcut reference), a style definition object, or a union of the two. Internal code references this alias instead of the public type.
 *
 * @example
 * ```ts
 * const item: InternalStyleItem = 'btn-primary'
 * const itemObj: InternalStyleItem = { color: 'red' }
 * ```
 */
export type InternalStyleItem = StyleItem

/**
 * Raw property content extracted from a style definition before optimization, where the value may be nullish to signal property removal.
 * @internal
 *
 * @remarks Produced by the extraction pipeline when walking a style definition tree. A `null` or `undefined` value means the property should be unset (removed) during optimization, allowing later definitions to cancel earlier ones.
 *
 * @example
 * ```ts
 * const extracted: ExtractedStyleContent = {
 *   selector: ['.pk-%'],
 *   property: 'color',
 *   value: ['red'],
 * }
 * ```
 */
export interface ExtractedStyleContent {
	/** Selector chain, where each element is a nesting level. The `%` placeholder is replaced with the atomic style ID. */
	selector: string[]
	/** The CSS property name in kebab-case. */
	property: string
	/** Resolved CSS values, or `null`/`undefined` to unset the property. */
	value: string[] | Nullish
}

/**
 * Fully resolved property content after optimization, with guaranteed non-nullish values and optional order-sensitivity metadata.
 * @internal
 *
 * @remarks Produced by `optimizeAtomicStyleContents` after deduplication and cancellation. The `orderSensitiveTo` field tracks dependency keys of earlier properties that affect the same CSS shorthand, ensuring the engine does not incorrectly reuse atomic style IDs across different call sites.
 *
 * @example
 * ```ts
 * const content: StyleContent = {
 *   selector: ['.pk-%'],
 *   property: 'margin-top',
 *   value: ['8px'],
 *   orderSensitiveTo: ['[".pk-%","margin"]'],
 * }
 * ```
 */
export interface StyleContent {
	/** Selector chain for the atomic rule. Each element is a nesting level; `%` is the ID placeholder. */
	selector: string[]
	/** The CSS property name in kebab-case. */
	property: string
	/** One or more CSS values. Multiple entries represent fallback declarations rendered in order. */
	value: string[]
	/**
	 * Serialized keys of preceding `StyleContent` entries whose CSS property effects overlap with this one, indicating the style is order-sensitive and must not reuse a cached atomic style ID.
	 *
	 * @default undefined
	 */
	orderSensitiveTo?: string[]
}

/**
 * A resolved atomic CSS rule consisting of a unique ID and its content.
 * @internal
 *
 * @remarks Each atomic style maps to exactly one CSS property-value pair under a specific selector chain. The `id` is a short generated class name (e.g. `pk-a`, `pk-bA`) that is substituted into the selector `%` placeholder at render time.
 *
 * @example
 * ```ts
 * const style: AtomicStyle = {
 *   id: 'pk-a',
 *   content: { selector: ['.pk-%'], property: 'color', value: ['red'] },
 * }
 * ```
 */
export interface AtomicStyle {
	/** Unique short identifier used as the CSS class name for this atomic rule. */
	id: string
	/** The resolved property-value-selector triple for this atomic rule. */
	content: StyleContent
}

/**
 * Intermediate structure representing a CSS rule block body with its declarations and optional nested children.
 *
 * @remarks Used during CSS rendering to incrementally build a tree of CSS blocks before serializing them to a string. Properties are declaration pairs, and children handle nested at-rules or pseudo-selectors.
 *
 * @example
 * ```ts
 * const body: CSSStyleBlockBody = {
 *   properties: [{ property: 'color', value: 'red' }],
 *   children: new Map(),
 * }
 * ```
 */
export interface CSSStyleBlockBody {
	/** Ordered list of CSS property-value declaration pairs within this block. */
	properties: { property: string, value: string }[]
	/**
	 * Nested CSS blocks keyed by their selector string (e.g. at-rules or pseudo-selectors).
	 *
	 * @default undefined
	 */
	children?: CSSStyleBlocks
}

/**
 * A `Map` from CSS selector strings to their corresponding block bodies, representing the tree structure of a CSS stylesheet.
 *
 * @remarks The map preserves insertion order, which is important for CSS specificity and cascade ordering. Used by the rendering pipeline to accumulate blocks before serializing to CSS text.
 *
 * @example
 * ```ts
 * const blocks: CSSStyleBlocks = new Map()
 * blocks.set('.pk-a', { properties: [{ property: 'color', value: 'red' }] })
 * ```
 */
export type CSSStyleBlocks = Map<string, CSSStyleBlockBody>