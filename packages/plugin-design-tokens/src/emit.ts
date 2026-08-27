import type { Variable, VariablesDefinition, VariableSuggest } from '@pikacss/core'
import type { TokenIR } from './ir'
import type { DesignTokensConfig, TokenLayer } from './types'
import { mergeTypeAutocomplete, resolveTypeAutocomplete } from './autocomplete'
import { resolveToken } from './resolve'

// A resolved variable value paired with the token's `$type` (for `$type`-driven
// suggestion targets) and layer (for strict `semanticOnly` suggestion hiding).
interface Entry {
	value: string
	type?: string
	layer?: TokenLayer
	description?: string
}

type MergedTypeAutocomplete = ReturnType<typeof mergeTypeAutocomplete>

// Builds one canonical S1 object-only Variables leaf. Suggestion metadata stays
// with Variables; Design Tokens only chooses semantic suggestion targets.
function buildVariable(entry: Entry, config: DesignTokensConfig, merged: MergedTypeAutocomplete): Variable {
	const asValueOf = resolveTypeAutocomplete(entry.type, merged) as VariableSuggest['asValueOf']
	const hidePrimitive = config.strict?.semanticOnly === true && entry.layer === 'primitive'
	return {
		value: entry.value,
		...(config.pruneUnused == null ? {} : { pruneUnused: config.pruneUnused }),
		...(entry.description == null ? {} : { description: entry.description }),
		...(hidePrimitive
			? { suggest: { asValueOf: false as const, asProperty: false } }
			: asValueOf === undefined
				? {}
				: { suggest: { asValueOf } }),
	}
}

/**
 * Emit stage: builds a `VariablesDefinition` from normalized tokens.
 *
 * @remarks Base tokens are emitted as top-level `--*` variables; theme tokens
 * are grouped under their resolved selector. When a theme carries a `media`
 * query, its variables are ADDITIONALLY emitted under an `@media <media>` scope
 * wrapping `:root` (a nested `VariablesDefinition`, which the core `variables`
 * system resolves). A token whose `$type` is present in the merged
 * {@link import('./autocomplete').DEFAULT_TYPE_AUTOCOMPLETE} map (overridable via
 * {@link DesignTokensConfig.typeAutocomplete}) emits
 * `VariableSuggest.asValueOf` so it is suggested as a `var()` value
 * for those CSS properties. Within each scope, later tokens override earlier ones
 * with the same name (last write wins), matching the legacy merge semantics.
 */
export function buildVariablesDefinition(irNodes: TokenIR[], config: DesignTokensConfig): VariablesDefinition {
	const prefix = config.prefix ?? ''
	const merged = mergeTypeAutocomplete(config.typeAutocomplete)
	const definition: VariablesDefinition = {}

	const baseEntries = new Map<string, Entry>()
	for (const ir of irNodes) {
		if (ir.themeScope != null)
			continue
		const { name, value } = resolveToken(ir, prefix)
		baseEntries.set(name, { value, type: ir.type, layer: ir.layer, description: ir.description })
	}
	for (const [name, entry] of baseEntries)
		definition[name as `--${string}`] = buildVariable(entry, config, merged)

	// Group theme tokens by their resolved selector (and additionally by media
	// query when configured), preserving first-appearance order so the emitted
	// scope blocks keep a stable order.
	const selectorEntries = new Map<string, Map<string, Entry>>()
	const mediaEntries = new Map<string, Map<string, Entry>>()
	for (const ir of irNodes) {
		if (ir.themeScope == null)
			continue
		const { name, value, themeScope } = resolveToken(ir, prefix)
		const entry: Entry = { value, type: ir.type, layer: ir.layer, description: ir.description }
		const selector = themeScope!.selector!
		const forSelector = selectorEntries.get(selector) ?? new Map<string, Entry>()
		selectorEntries.set(selector, forSelector)
		forSelector.set(name, entry)
		if (themeScope!.media != null) {
			const media = themeScope!.media
			const forMedia = mediaEntries.get(media) ?? new Map<string, Entry>()
			mediaEntries.set(media, forMedia)
			forMedia.set(name, entry)
		}
	}

	const buildScoped = (entries: Map<string, Entry>): VariablesDefinition => {
		const scoped: VariablesDefinition = {}
		for (const [name, entry] of entries)
			scoped[name as `--${string}`] = buildVariable(entry, config, merged)
		return scoped
	}

	for (const [selector, entries] of selectorEntries) {
		// Each selector is a unique map key (same-selector themes were already
		// merged into `entries`), so a plain assignment is sufficient.
		definition[selector] = buildScoped(entries)
	}

	for (const [media, entries] of mediaEntries) {
		// Core resolves nested non-'--' scope keys, so express the media wrapper as
		// a nested `VariablesDefinition` around `:root`.
		definition[`@media ${media}`] = { ':root': buildScoped(entries) }
	}

	return definition
}
