/**
 * Output-format classification of a `pika()` call variant.
 *
 * - `'normal'` — output format follows the integration's `transformedFormat` option.
 * - `'forceString'` — always emits a space-joined string literal (`pika.str`).
 * - `'forceArray'` — always emits an array of string literals (`pika.arr`).
 */
export type FnOutputKind = 'normal' | 'forceString' | 'forceArray'

/**
 * One recognized `pika()` call variant, derived from the configured base function name.
 *
 * @remarks
 * Variants are identified by their canonical dot-form name (e.g. `'pika.str'`).
 * Bracket-notation call sites (`pika['str']`, `` pika[`str`] ``) are normalized
 * to the dot form by the macro collector before variant lookup, so bracket
 * forms are never enumerated here.
 */
export interface FnVariant {
	/** Canonical dot-form name, e.g. `'pika'`, `'pika.str'`. */
	name: string
	/** Root identifier of the call site: the configured base function name. */
	root: string
	/** Member property of the variant, or `null` for bare calls. */
	property: 'str' | 'arr' | null
	/** Output-format classification of this variant. */
	kind: FnOutputKind
}

/**
 * Structured description of all `pika()` call variants derived from a base function name.
 *
 * @remarks
 * Replaces the legacy regex-based `FnUtils` classification: the AST macro
 * collector matches call sites against `roots` and looks classification up in
 * `variants` instead of testing name strings against a compiled regex.
 */
export interface FnConfig {
	/** The configured base function name (e.g. `'pika'`). */
	fnName: string
	/** Root identifiers that make a callee a candidate macro call. */
	roots: ReadonlySet<string>
	/** All variants keyed by canonical dot-form name. */
	variants: ReadonlyMap<string, FnVariant>
}

/**
 * Builds the structured variant config for all `pika()` call forms derived from the given base name.
 *
 * @param fnName - The base function name (e.g. `'pika'`). The `.str`/`.arr` members are derived from it.
 * @returns An immutable {@link FnConfig} describing all three variants.
 *
 * @remarks
 * Keep variant derivation in sync with `buildFnNamePatterns` in
 * `@pikacss/eslint-config` (`packages/eslint-config/src/utils/fn-names.ts`),
 * which re-derives the same dot-form variants without a runtime dependency on
 * this package. The consistency test in its `fn-names.test.ts` guards the agreement.
 *
 * @example
 * ```ts
 * const config = createFnConfig('pika')
 * config.roots.has('pika') // true
 * config.variants.get('pika.str')?.kind // 'forceString'
 * ```
 */
export function createFnConfig(fnName: string): FnConfig {
	const variants = new Map<string, FnVariant>()
	variants.set(fnName, { name: fnName, root: fnName, property: null, kind: 'normal' })
	variants.set(`${fnName}.str`, { name: `${fnName}.str`, root: fnName, property: 'str', kind: 'forceString' })
	variants.set(`${fnName}.arr`, { name: `${fnName}.arr`, root: fnName, property: 'arr', kind: 'forceArray' })

	return {
		fnName,
		roots: new Set([fnName]),
		variants,
	}
}

/**
 * Resolves the concrete output format for a call variant under the given default format.
 *
 * @param variant - The matched call variant.
 * @param transformedFormat - The integration's configured default output format for normal calls.
 * @returns `'string'` or `'array'` — the format the transformed literal must use.
 */
export function resolveOutputFormat(variant: FnVariant, transformedFormat: 'string' | 'array'): 'string' | 'array' {
	switch (variant.kind) {
		case 'forceString':
			return 'string'
		case 'forceArray':
			return 'array'
		default:
			return transformedFormat
	}
}
