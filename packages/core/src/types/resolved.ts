import type { InternalProperties, InternalStyleDefinition, InternalStyleItem, PikaAugment } from './shared'
import type { ResolveFrom } from './utils'

/**
 * The effective selector string type resolved from `PikaAugment.Selector`, falling back to plain `string`.
 * @internal
 *
 * @remarks Plugins can narrow the selector type via module augmentation to restrict accepted selector strings in `pika()` calls.
 *
 * @example
 * ```ts
 * type S = ResolvedSelector // string (default) or narrowed by plugin
 * ```
 */
export type ResolvedSelector = ResolveFrom<PikaAugment, 'Selector', string, string>
/**
 * The effective `Properties` type resolved from `PikaAugment.Properties`, falling back to the internal default `InternalProperties`.
 * @internal
 *
 * @remarks This is the full property map including standard CSS, custom, and extra properties. Used as the base type for style definition values.
 *
 * @example
 * ```ts
 * type P = ResolvedProperties // Properties (default) or plugin-augmented
 * ```
 */
export type ResolvedProperties = ResolveFrom<PikaAugment, 'Properties', any, InternalProperties>
/**
 * The subset of `ResolvedProperties` that contains only standard CSS properties, computed by excluding extra (non-CSS) property keys.
 * @internal
 *
 * @remarks Core extension/directive authoring no longer flows through global autocomplete augmentation; generated Typegen owns those overlays.
 *
 * @example
 * ```ts
 * type CP = ResolvedCSSProperties // Effective CSS property surface
 * ```
 */
export type ResolvedCSSProperties = ResolvedProperties
/**
 * The effective `StyleDefinition` type resolved from `PikaAugment.StyleDefinition`, falling back to the internal default.
 * @internal
 *
 * @remarks A style definition can be a flat property map or a nested selector-keyed structure. Plugin augmentation can extend this with additional accepted shapes.
 *
 * @example
 * ```ts
 * type SD = ResolvedStyleDefinition // StyleDefinition (default) or plugin-augmented
 * ```
 */
export type ResolvedStyleDefinition = ResolveFrom<PikaAugment, 'StyleDefinition', any, InternalStyleDefinition>
/**
 * The effective `StyleItem` type resolved from `PikaAugment.StyleItem`, falling back to the internal default.
 * @internal
 *
 * @remarks A style item is either a string reference (shortcut name / class name), a style definition object, or a combination. Plugin augmentation can extend accepted item shapes.
 *
 * @example
 * ```ts
 * type SI = ResolvedStyleItem // StyleItem (default) or plugin-augmented
 * ```
 */
export type ResolvedStyleItem = ResolveFrom<PikaAugment, 'StyleItem', any, InternalStyleItem>
