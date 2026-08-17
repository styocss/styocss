import type { IntegrationContext } from './types'
import { log, sortLayerNames } from '@pikacss/core'

const RE_KEBAB_BOUNDARY = /-([a-z])/g

/**
 * One governed CSS property paired with the members of its exclusive value union.
 * @internal
 *
 * @remarks Structural mirror of `@pikacss/plugin-design-tokens`'s
 * `StrictTypeEntry`. Defined locally so the integration does not depend on the
 * plugin package; it is read through a duck-typed engine surface
 * (`engine.designTokens.strictTypes()`).
 */
interface StrictTypeEntry {
	/** The governed CSS property name, in kebab-case. */
	property: string
	/** Union members, each already a valid TypeScript type expression. */
	union: string[]
}

/**
 * Structural shape of an engine plugin that publishes strict-type narrowing data.
 * @internal
 *
 * @remarks limit: single-producer duck-typed convention. The only planned
 * producer is `@pikacss/plugin-design-tokens`, which augments the engine with
 * `engine.designTokens.strictTypes()`. Integration must not import the plugin.
 */
interface StrictTypesProducerEngine {
	designTokens?: {
		strictTypes?: () => StrictTypeEntry[]
	}
}

/**
 * Drains the strict-type narrowing entries from a known engine producer.
 * @internal
 *
 * @param ctx - The integration context providing the initialized engine.
 * @returns The producer's entries, or an empty array when no producer surface is
 * present or it returns a non-array.
 */
function getStrictTypeEntries(ctx: IntegrationContext): StrictTypeEntry[] {
	const strictTypes = (ctx.engine as unknown as StrictTypesProducerEngine).designTokens?.strictTypes
	if (typeof strictTypes !== 'function')
		return []
	const entries = strictTypes()
	return Array.isArray(entries) ? entries : []
}

// Converts a kebab-case CSS property to its camelCase form (`background-color` ->
// `backgroundColor`). Both forms are emitted as constraint keys so a value is
// narrowed whether the author writes the property in kebab or camel case.
function kebabToCamel(property: string): string {
	return property.replace(RE_KEBAB_BOUNDARY, (_, char: string) => char.toUpperCase())
}

// Unions with more than this many members are hoisted into a named type alias so
// TypeScript instantiates the member list once and shares it across every property
// that references it — a property's kebab and camel keys, and all properties
// governed by the same token `$type` (e.g. every color property). Re-inlining the
// full union per property is the dominant strict-mode type-check and IDE-completion
// cost at large token counts, where each governed union carries hundreds of
// template-literal members across ~50 property keys. Smaller unions stay inline:
// the alias indirection saves nothing there and only obscures the output. Any real
// governed union carries at least the CSS-wide keywords plus functional escape
// hatches (11 members), so this threshold hoists every real union while leaving
// trivial ones inline.
const HOIST_UNION_MIN_SIZE = 8

// The members present in every one of `lists` (assumed non-empty), in the order
// they first appear in the first list. Used to hoist the tail shared by all
// governed unions (CSS-wide keywords, functional escape hatches, string
// allowedValues) into a single alias.
function commonMembers(lists: string[][]): string[] {
	const rest = lists.slice(1)
		.map(list => new Set(list))
	return lists[0]!.filter(member => rest.every(set => set.has(member)))
}

/**
 * Renders the strict-type constraint object type from the producer's entries.
 * @internal
 *
 * @param entries - The per-property exclusive value unions.
 * @returns The alias declarations followed by the lines defining the
 * `__PikaStrictProperties` type, or an empty array when there is nothing to narrow
 * (keeping output byte-identical to a project without strict types).
 *
 * @remarks Each governed property is emitted twice — kebab and camel — so both
 * authoring styles are constrained. The value type is `PropertyValue<union>`, the
 * union rendered flat (no nested conditional types). To keep the type cost bounded
 * at large token counts, unions larger than {@link HOIST_UNION_MIN_SIZE} are
 * hoisted behind named, content-deduplicated aliases (`__PikaStrict0`, …): the
 * kebab and camel keys of a property, and every property governed by the same
 * `$type`, reference one shared alias instead of re-inlining the members. The tail
 * common to all hoisted unions (keywords, functional escape hatches, string
 * allowedValues) is factored into a single `__PikaStrictShared` alias so those
 * template-literal members are instantiated once rather than per union. Trivial and
 * empty unions stay inline. Intersecting the resulting all-optional object with
 * `StyleItem` makes the governed keys exclusive on object definitions while leaving
 * string items, nested selectors, and non-governed properties untouched.
 */
function generateStrictConstraint(entries: StrictTypeEntry[]): string[] {
	if (entries.length === 0)
		return []

	const aliasLines: string[] = []

	// Factor the tail shared by all hoisted unions into one alias. Only worthwhile
	// with at least two hoisted unions; with fewer there is nothing to share.
	const hoistedUnions = entries.map(entry => entry.union)
		.filter(union => union.length > HOIST_UNION_MIN_SIZE)
	const shared = hoistedUnions.length >= 2 ? commonMembers(hoistedUnions) : []
	const sharedSet = new Set(shared)
	if (shared.length > 0)
		aliasLines.push(`type __PikaStrictShared = ${formatUnionType(shared)}`)

	// Renders one property's value type: large unions are hoisted behind a named,
	// content-deduplicated alias; small (or empty) unions stay inline.
	const aliasByUnion = new Map<string, string>()
	let aliasCount = 0
	const renderValue = (union: string[]): string => {
		if (union.length <= HOIST_UNION_MIN_SIZE)
			return `PropertyValue<${formatUnionType(union)}>`

		const unionKey = union.join(' ')
		let alias = aliasByUnion.get(unionKey)
		if (alias === undefined) {
			alias = `__PikaStrict${aliasCount++}`
			const specific = shared.length > 0 ? union.filter(member => !sharedSet.has(member)) : union
			const parts = shared.length > 0 ? [...specific, '__PikaStrictShared'] : specific
			aliasLines.push(`type ${alias} = ${formatUnionType(parts)}`)
			aliasByUnion.set(unionKey, alias)
		}
		return `PropertyValue<${alias}>`
	}

	const members: string[] = []
	for (const { property, union } of entries) {
		const value = renderValue(union)
		members.push(`  ${JSON.stringify(property)}?: ${value}`)
		const camel = kebabToCamel(property)
		if (camel !== property)
			members.push(`  ${JSON.stringify(camel)}?: ${value}`)
	}

	return [
		...aliasLines,
		...(aliasLines.length > 0 ? [''] : []),
		'type __PikaStrictProperties = {',
		...members,
		'}',
		'',
	]
}

function formatUnionType(parts: string[]) {
	return parts.length > 0
		? parts.join(' | ')
		: 'never'
}

function formatUnionStringType(list: string[]) {
	return formatUnionType(list.map(i => JSON.stringify(i)))
}

function formatAutocompleteUnion(literals: Iterable<string>, patterns: Iterable<string>) {
	return formatUnionType([
		...Array.from(literals, value => JSON.stringify(value)),
		...patterns,
	])
}

function formatAutocompleteValueMap(
	keys: Iterable<string>,
	entries: Map<string, string[]>,
	patternEntries: Map<string, string[]>,
	formatValue: (values: string[], patterns: string[]) => string,
) {
	const mergedKeys = new Set<string>(keys)
	for (const key of entries.keys()) {
		mergedKeys.add(key)
	}
	for (const key of patternEntries.keys()) {
		mergedKeys.add(key)
	}

	return mergedKeys.size > 0
		? `{ ${Array.from(mergedKeys, key => `${JSON.stringify(key)}: ${formatValue(entries.get(key) || [], patternEntries.get(key) || [])}`)
			.join(', ')} }`
		: 'never'
}

function generateAutocomplete(ctx: IntegrationContext) {
	const autocomplete = ctx.engine.config.autocomplete
	const patterns = autocomplete.patterns ?? {
		selectors: new Set<string>(),
		shortcuts: new Set<string>(),
		properties: new Map<string, string[]>(),
		cssProperties: new Map<string, string[]>(),
	}
	const { layers } = ctx.engine.config
	const layerNames = sortLayerNames(layers)
	return [
		'export type Autocomplete = {',
		`  Selector: ${formatAutocompleteUnion(autocomplete.selectors, patterns.selectors)}`,
		`  Shortcut: ${formatAutocompleteUnion(autocomplete.shortcuts, patterns.shortcuts)}`,
		`  PropertyValue: ${formatAutocompleteValueMap(autocomplete.extraProperties, autocomplete.properties, patterns.properties, (values, patterns) => formatUnionType([...values, ...patterns]))}`,
		`  CSSPropertyValue: ${formatAutocompleteValueMap(autocomplete.extraCssProperties, autocomplete.cssProperties, patterns.cssProperties, (values, patterns) => formatAutocompleteUnion(values, patterns))}`,
		`  Layer: ${formatUnionStringType(layerNames)}`,
		'}',
		'',
	]
}

function generateStyleFn(ctx: IntegrationContext, strictEntries: StrictTypeEntry[]) {
	const { transformedFormat } = ctx
	// When strict types are active, intersect the item type with the constraint so
	// governed properties become exclusive on object definitions; otherwise emit
	// the plain `StyleItem` (byte-identical to a project without strict types).
	const itemType = strictEntries.length > 0
		? '(StyleItem & __PikaStrictProperties)'
		: 'StyleItem'
	const lines: string[] = [
		`type StyleFn_Array = (...params: ${itemType}[]) => string[]`,
		`type StyleFn_String = (...params: ${itemType}[]) => string`,
	]

	if (transformedFormat === 'array')
		lines.push('type StyleFn_Normal = StyleFn_Array')
	else if (transformedFormat === 'string')
		lines.push('type StyleFn_Normal = StyleFn_String')

	lines.push(
		'type StyleFn = StyleFn_Normal & {',
		'  str: StyleFn_String',
		'  arr: StyleFn_Array',
		'}',
		'',
	)

	return lines
}

function generateGlobalDeclaration(ctx: IntegrationContext) {
	const { fnName } = ctx
	return [
		'declare global {',
		'  /**',
		'   * PikaCSS',
		'   */',
		`  const ${fnName}: StyleFn`,
		'}',
		'',
	]
}

function generateVueDeclaration(ctx: IntegrationContext) {
	const { hasVue, fnName } = ctx

	if (!hasVue)
		return []

	return [
		'declare module \'vue\' {',
		'  interface ComponentCustomProperties {',
		'    /**',
		'     * PikaCSS',
		'     */',
		`    ${fnName}: StyleFn`,
		'  }',
		'}',
		'',
	]
}

/**
 * Generates the full content of the `pika.gen.ts` TypeScript declaration file from the effective project/type configuration.
 * @internal
 *
 * @param ctx - The integration context providing engine config and codegen settings.
 * @returns The complete TypeScript source string for the generated declaration file.
 *
 * @remarks
 * The output includes module augmentation for `PikaAugment`, autocomplete type literals
 * derived from selectors/shortcuts/properties, style function type overloads (respecting
 * `transformedFormat`), global declarations, and optional Vue component property
 * declarations. It is a deterministic projection of the effective engine/type
 * configuration: source usage records, transform order, and observed module sets are
 * deliberately NOT inputs, so equivalent configurations generate byte-identical output.
 */
export async function generateTsCodegenContent(ctx: IntegrationContext) {
	log.debug('Generating TypeScript code generation content')

	const strictEntries = getStrictTypeEntries(ctx)
	// `PropertyValue` is only referenced by the strict constraint, so it is added
	// to the import solely when strict types are active, keeping the disabled-mode
	// output byte-identical.
	const coreImports = ['CSSProperty', 'CSSSelector', 'Properties', 'StyleDefinition', 'StyleItem']
	if (strictEntries.length > 0)
		coreImports.push('PropertyValue')

	const lines = [
		`// Auto-generated by ${ctx.currentPackageName}`,
		`import type { ${coreImports.join(', ')} } from \'${ctx.currentPackageName}\'`,
		'',
		`declare module \'${ctx.currentPackageName}\' {`,
		'  interface PikaAugment {',
		'    Autocomplete: Autocomplete',
		'    Selector: Autocomplete[\'Selector\'] | CSSSelector',
		'    CSSProperty: ([Autocomplete[\'CSSPropertyValue\']] extends [never] ? never : Extract<keyof Autocomplete[\'CSSPropertyValue\'], string>) | CSSProperty',
		'    Properties: Properties',
		'    StyleDefinition: StyleDefinition',
		'    StyleItem: StyleItem',
		'  }',
		'}',
		'',
	]

	lines.push(...generateAutocomplete(ctx))
	lines.push(...generateStrictConstraint(strictEntries))
	lines.push(...generateStyleFn(ctx, strictEntries))
	lines.push(...generateGlobalDeclaration(ctx))
	lines.push(...generateVueDeclaration(ctx))
	log.debug('TypeScript code generation content completed')

	return lines.join('\n')
}
