import type { StrictContext } from './strict'

// CSS-wide keywords accepted on any governed property. Kept in sync with
// `strict.ts`'s CSS_WIDE_KEYWORDS. All CSS-wide keywords are lowercase in the
// spec, which is what runtime keyword matching (case-insensitive) canonicalizes
// to and what authors write.
const CSS_WIDE_KEYWORDS = ['inherit', 'initial', 'unset', 'revert', 'revert-layer']

// Built-in per-`$type` allowlist rendered as canonical-case literals. Runtime
// (`strict.ts` BUILTIN_ALLOWLIST) matches these case-insensitively; the emitted
// literals use the canonical CSS casing authors write.
// limit: the generated literals are case-sensitive whereas the runtime allowlist
// and CSS-wide-keyword checks are case-insensitive, so an unusually-cased value
// the runtime would accept (e.g. `INHERIT`, `CurrentColor`) is rejected by the
// type. Upgrade path: emit case-permuted members or a case-insensitive pattern.
const BUILTIN_TYPE_LITERALS: Record<string, string[]> = {
	color: ['transparent', 'currentColor'],
	dimension: ['0', 'auto'],
}

// Functional forms the runtime strict checker accepts (when their var() refs are
// all registered tokens). Rendered as template-literal types so any argument is
// accepted at the type level; the runtime still validates the refs and reports a
// diagnostic when they are not tokens. Kept in sync with `strict.ts` FUNCTIONAL_RE.
const FUNCTIONAL_NAMES = ['calc', 'color-mix', 'min', 'max', 'clamp', 'light-dark']

/**
 * The exclusive TypeScript value type of one governed CSS property, ready for the
 * Design Tokens Typegen producer to render into its `propertyConstraints` contribution.
 *
 * @remarks These entries are plugin-private intermediate data; `configureEngine` publishes only the resulting generic Core Typegen contribution.
 */
export interface StrictTypeEntry {
	/** The governed CSS property name, in kebab-case (e.g. `'background-color'`). */
	property: string
	/**
	 * The members of the exclusive value union, each already a valid TypeScript
	 * type expression: string literals are double-quoted (e.g. `"var(--x)"`,
	 * `"inherit"`) and template-literal members are backtick strings (e.g.
	 * `` `calc(${string})` ``). The consumer joins them with ` | `.
	 */
	union: string[]
}

// Renders a string literal as a TypeScript double-quoted literal type.
function literal(value: string): string {
	return JSON.stringify(value)
}

/**
 * Builds the per-property exclusive value unions for strict-type codegen.
 *
 * @internal
 *
 * @param ctx - The resolved strict context (token `$type` map, governed
 * properties, and user `allowedValues`).
 * @returns One {@link StrictTypeEntry} per governed property, or an empty array
 * when there are no governed properties or a `RegExp` `allowedValues` entry
 * disables narrowing.
 *
 * @remarks Mirrors the runtime validity rules in `strict.ts` so the generated
 * type never rejects a value the runtime strict checker would accept: every
 * governing-`$type` token var (bare, fallback, and whitespace-tolerant forms),
 * the CSS-wide keywords,
 * the built-in per-`$type` allowlist, string `allowedValues`, and the functional
 * template escape hatches. `RegExp` `allowedValues` cannot be represented as a
 * literal union, so their presence disables narrowing for all properties.
 */
export function buildStrictTypeEntries(ctx: StrictContext): StrictTypeEntry[] {
	// A RegExp allowedValue applies to every governed property and cannot be
	// faithfully represented as a literal union. Disable narrowing rather than
	// emit a union that rejects a value the runtime would accept.
	if (ctx.allowedValues.some(entry => entry instanceof RegExp))
		return []

	const stringAllowed = ctx.allowedValues.filter((entry): entry is string => typeof entry === 'string')

	const functionalTemplates = FUNCTIONAL_NAMES.map(name => `\`${name}(\${string})\``)

	const entries: StrictTypeEntry[] = []
	for (const [property, type] of ctx.propertyToType) {
		// A Set preserves first-seen order while dropping duplicates (e.g. a
		// string allowedValue that repeats a built-in literal).
		const union = new Set<string>()

		// Rule 4a: var() references to a token of this `$type`. The runtime
		// (`strict.ts` BARE_VAR_RE, matched against the trimmed value) accepts the
		// bare reference, an optional `,`-separated fallback of any content, and
		// arbitrary whitespace inside the parentheses -- e.g. `var(--x)`,
		// `var( --x )`, `var(--x,red)` and `var(--x, red)` are all valid. The two
		// exact members are the tightest common forms and part of the stable
		// emitted surface; the trailing template below widens them to cover the
		// whitespace/fallback variants so the type never rejects a value the
		// runtime accepts.
		// limit: the leading/trailing `${string}` also type-accepts a var() whose
		// name merely *contains* this one as a substring (e.g.
		// `var(--color-primary-x)` on a `--color-primary` union) when that name is
		// not itself a token of this `$type`; the runtime would reject it. That is
		// a false negative (type accepts, runtime rejects), never a false positive,
		// so the "never reject a runtime-accepted value" contract still holds.
		// Upgrade path: emit a whitespace-only helper type instead of `${string}`.
		for (const [varName, varType] of ctx.typeByVar) {
			if (varType !== type)
				continue
			union.add(literal(`var(${varName})`))
			union.add(`\`var(${varName}, \${string})\``)
			union.add(`\`var(\${string}${varName}\${string})\``)
		}

		// Rule 4b: CSS-wide keywords.
		for (const keyword of CSS_WIDE_KEYWORDS)
			union.add(literal(keyword))

		// Rule 4c: built-in per-`$type` allowlist + user string allowedValues.
		for (const value of BUILTIN_TYPE_LITERALS[type] ?? [])
			union.add(literal(value))
		for (const value of stringAllowed)
			union.add(literal(value))

		// Rule 4d: functional escape hatches.
		for (const template of functionalTemplates)
			union.add(template)

		entries.push({ property, union: [...union] })
	}

	return entries
}
