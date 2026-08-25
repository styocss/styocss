import type { Arrayable } from '@pikacss/core'

/**
 * Built-in `$type` → CSS-property autocomplete map. A token carrying one of these
 * `$type`s emits `VariableSuggest.asValueOf` with the matching
 * property list, so the variable is suggested as a `var()` value for exactly
 * those CSS properties.
 *
 * @remarks User entries from {@link import('./types').DesignTokensConfig.typeAutocomplete}
 * are merged over this map (replacing the entry for a `$type`, or suppressing it
 * with `false`). `$type`s absent from the merged map produce no `suggest.asValueOf` field, so the Core Variables default remains `false`.
 */
export const DEFAULT_TYPE_AUTOCOMPLETE: Record<string, string[]> = {
	color: ['color', 'background-color', 'border-color', 'outline-color', 'fill', 'stroke'],
	dimension: ['width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'margin', 'padding', 'gap', 'inset', 'font-size', 'border-radius'],
	duration: ['transition-duration', 'animation-duration'],
	fontFamily: ['font-family'],
	fontWeight: ['font-weight'],
	number: ['z-index', 'opacity', 'line-height', 'flex-grow', 'flex-shrink', 'order'],
	shadow: ['box-shadow'],
	cubicBezier: ['transition-timing-function', 'animation-timing-function'],
}

/**
 * Merges the user's `typeAutocomplete` override map over {@link DEFAULT_TYPE_AUTOCOMPLETE}.
 *
 * @param override - The user-configured per-`$type` map. Each entry replaces the
 * default for that `$type`; a `false` value suppresses value-of suggestions for it.
 * @returns The effective merged map.
 */
export function mergeTypeAutocomplete(
	override?: Record<string, Arrayable<string> | false>,
): Record<string, Arrayable<string> | false> {
	return { ...DEFAULT_TYPE_AUTOCOMPLETE, ...override }
}

/**
 * Resolves the `asValueOf` autocomplete targets for a token's `$type` against a
 * merged type map.
 *
 * @param type - The token's `$type`, or `undefined` when it carries none.
 * @param merged - The merged map from {@link mergeTypeAutocomplete}.
 * @returns The property list for a mapped `$type`, `false` to suppress suggestions,
 * or `undefined` when the token has no `$type` or its `$type` is absent from the map.
 */
export function resolveTypeAutocomplete(
	type: string | undefined,
	merged: Record<string, Arrayable<string> | false>,
): string[] | false | undefined {
	if (type == null || !(type in merged))
		return undefined
	const entry = merged[type]!
	if (entry === false)
		return false
	return [entry].flat()
}
