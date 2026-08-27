/**
 * CSS TypeScript type definitions generator.
 *
 * Reads processed CSS metadata from `scripts/css-data` and generates
	* a self-contained TypeScript file at `packages/core/src/generated/csstype.ts`.
 *
 * Usage:
 *   pnpm generate:core:csstype
 */

import type {
	ProcessedCssAtRule,
	ProcessedCssCompatibility,
	ProcessedCssProperty,
	ProcessedCssSelector,
	ProcessedCssSourcePresence,
	ProcessedCssSyntax,
} from './types'
import fs from 'node:fs'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'pathe'

import { loadProcessedCssData } from './index'

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUTPUT_PATH = path.resolve(__dirname, '..', '..', 'packages', 'core', 'src', 'generated', 'csstype.ts')
const RE_OPTIONAL_MULTIPLIER = /\{[\d,]+\}\s*$/
const RE_OPTIONAL_SUFFIX = /[?+*#]+\s*$/
const RE_FUNCTION_CALL = /^[\w-]+\(/
const RE_PROPERTY_REFERENCE = /^<'([^']+)'>$/
const RE_DATA_TYPE_REFERENCE = /^<([\w-]+(?:\(\))?)(?:\s*\[.*?\])?>$/
const RE_NUMERIC_LITERAL = /^\d+(?:\.\d+)?$/
const RE_KEYWORD_LITERAL = /^\w[\w-]*$/
const RE_MULTIPLIER_TOKEN = /^[?+*#{}]+$/
const RE_COMPLEX_TYPE_REF = /<([\w-]+(?:\(\))?)(?:\s*\[.*?\])?>/g
const RE_COMPLEX_PROPERTY_REF = /<'([\w-]+)'>/g
const RE_EMPTY_CALL_SUFFIX = /\(\)$/
const RE_VENDOR_PREFIX = /^-(webkit|moz|ms|o)-/
const RE_KEBAB_SEGMENT = /-([a-z0-9])/gi
const RE_GENERIC_SUFFIX = /<.*>$/
const RE_QUOTED_LITERAL = /"([^"]+)"/g
const RE_UPPERCASE_START = /^[A-Z]/

// ---------------------------------------------------------------------------
// 1. DATA LOADING
// ---------------------------------------------------------------------------

interface PropertyEntry extends Pick<ProcessedCssProperty, 'syntax' | 'initial' | 'inherited' | 'status' | 'compatibility' | 'sourcePresence'> {
	mdnUrl?: string
	groups: string[]
}

const processedCssData = loadProcessedCssData()
const allProperties: Record<string, PropertyEntry> = processedCssData.properties
const patchedSyntaxes: Record<string, ProcessedCssSyntax> = processedCssData.syntaxes
const processedAtRules: Record<string, ProcessedCssAtRule> = processedCssData.atRules
const processedSelectors: Record<string, ProcessedCssSelector> = processedCssData.selectors

// ---------------------------------------------------------------------------
// 2. CSS SYNTAX PARSER
// ---------------------------------------------------------------------------

interface TypeComponent {
	kind: 'literal' | 'number' | 'string' | 'length' | 'time' | 'datatype' | 'generic'
	value?: string
}

/** Well-known data types that resolve to named DataType.X references */
const KNOWN_DATA_TYPES: Record<string, string> = {
	'absolute-size': 'AbsoluteSize',
	'attachment': 'Attachment',
	'blend-mode': 'BlendMode',
	'color': 'Color',
	'content-distribution': 'ContentDistribution',
	'content-position': 'ContentPosition',
	'display-inside': 'DisplayInside',
	'display-outside': 'DisplayOutside',
	'display-internal': 'DisplayInternal',
	'display-legacy': 'DisplayLegacy',
	'easing-function': 'EasingFunction',
	'generic-family': 'GenericFamily',
	'geometry-box': 'GeometryBox',
	'line-style': 'LineStyle',
	'line-width': 'LineWidth',
	'named-color': 'NamedColor',
	'position': 'Position',
	'repeat-style': 'RepeatStyle',
	'self-position': 'SelfPosition',
	'visual-box': 'VisualBox',
	'compositing-operator': 'CompositingOperator',
	'masking-mode': 'MaskingMode',
	'single-animation-direction': 'SingleAnimationDirection',
	'single-animation-fill-mode': 'SingleAnimationFillMode',
	'single-animation-timeline': 'SingleAnimationTimeline',
	'single-animation-composition': 'SingleAnimationComposition',
	'cubic-bezier-easing-function': 'CubicBezierEasingFunction',
	'step-easing-function': 'StepEasingFunction',
	'bg-clip': 'BgClip',
	'font-stretch-absolute': 'FontStretchAbsolute',
	'font-weight-absolute': 'FontWeightAbsolute',
	'east-asian-variant-values': 'EastAsianVariantValues',
	'page-size': 'PageSize',
	'paint': 'Paint',
	'quote': 'Quote',
	'timeline-range-name': 'TimelineRangeName',
	'system-color': 'SystemColor',
	'deprecated-system-color': 'DeprecatedSystemColor',
	'compat-auto': 'CompatAuto',
	'composite-style': 'CompositeStyle',
	'animateable-feature': 'AnimateableFeature',
	'cursor-predefined': 'CursorPredefined',
	'outline-line-style': 'OutlineLineStyle',
	'try-size': 'TrySize',
	'try-tactic': 'TryTactic',
	'position-area': 'PositionArea',
}

/** Primitive/built-in type references */
const PRIMITIVE_TYPES: Record<string, TypeComponent['kind']> = {
	'length': 'length',
	'length-percentage': 'length',
	'time': 'time',
	'number': 'string',
	'integer': 'string',
	'percentage': 'string',
	'string': 'string',
	'custom-ident': 'string',
	'ident': 'string',
	'url': 'string',
	'image': 'string',
	'angle': 'string',
	'resolution': 'string',
	'frequency': 'string',
	'flex': 'string',
	'ratio': 'string',
	'dimension': 'string',
	'alpha-value': 'string',
	'shape-box': 'string',
	'basic-shape': 'string',
	'filter-function': 'string',
	'transform-function': 'string',
	'gradient': 'string',
	'counter-style': 'string',
	'counter-style-name': 'string',
	'family-name': 'string',
	'generic-name': 'string',
	'nth': 'string',
	'an-plus-b': 'string',
	'an+b': 'string',
	'calc-sum': 'string',
	'declaration-value': 'string',
	'hex-color': 'string',
	'dashed-ident': 'string',
	'unicode-range': 'string',
	'unicode-range-token': 'string',
	'reversed-counter-name': 'string',
	'media-query-list': 'string',
}

function dedup(components: TypeComponent[]): TypeComponent[] {
	const seen = new Set<string>()
	const result: TypeComponent[] = []
	for (const c of components) {
		const key = `${c.kind}:${c.value ?? ''}`
		if (!seen.has(key)) {
			seen.add(key)
			result.push(c)
		}
	}
	return result
}

function parseSyntaxToTypes(
	syntax: string,
	syntaxes: Record<string, ProcessedCssSyntax>,
	visited?: Set<string>,
): TypeComponent[] {
	if (!syntax)
		return [{ kind: 'string' }]

	const vis = visited ?? new Set<string>()
	const components: TypeComponent[] = []

	// Check for top-level combinators: && or || indicate all components needed together
	// We only want to split on bare | (alternation), not || or &&
	// Simple approach: split on ' | ' but be careful about brackets and nested structures

	const alternatives = splitAlternatives(syntax)

	for (const alt of alternatives) {
		const trimmed = alt.trim()
		if (!trimmed)
			continue

		parseAlternative(trimmed, syntaxes, vis, components)
	}

	return dedup(components)
}

/**
 * Split a syntax string on top-level `|` alternation only.
 * Respects bracket nesting and does not split `||` or `&&`.
 */
function splitAlternatives(syntax: string): string[] {
	const results: string[] = []
	let depth = 0
	let current = ''

	for (let i = 0; i < syntax.length; i++) {
		const ch = syntax[i]
		if (ch === '[' || ch === '(') {
			depth++
			current += ch
		}
		else if (ch === ']' || ch === ')') {
			depth--
			current += ch
		}
		else if (depth === 0 && ch === '|' && syntax[i + 1] !== '|' && (i === 0 || syntax[i - 1] !== '|')) {
			results.push(current)
			current = ''
		}
		else {
			current += ch
		}
	}
	results.push(current)
	return results
}

function parseAlternative(
	alt: string,
	syntaxes: Record<string, ProcessedCssSyntax>,
	visited: Set<string>,
	components: TypeComponent[],
): void {
	const trimmed = alt.trim()
	if (!trimmed)
		return

	// Strip optional multipliers at end: ?, +, *, #, {n,m}
	let cleaned = trimmed
		.replace(RE_OPTIONAL_MULTIPLIER, '')
		.replace(RE_OPTIONAL_SUFFIX, '')
		.trim()

	// Check for && or || combinators or juxtaposition with multiple terms
	if (hasComplexCombinator(cleaned)) {
		// Complex: multiple values needed → string fallback
		// But still try to extract individual keywords and types from the parts
		extractFromComplex(cleaned, syntaxes, visited, components)
		return
	}

	// Strip surrounding brackets [ ... ]
	if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
		cleaned = cleaned.slice(1, -1)
			.trim()
		// Re-check after stripping brackets
		if (hasComplexCombinator(cleaned)) {
			extractFromComplex(cleaned, syntaxes, visited, components)
			return
		}
		// Try splitting alternatives inside brackets
		const innerAlts = splitAlternatives(cleaned)
		if (innerAlts.length > 1) {
			for (const a of innerAlts) {
				parseAlternative(a, syntaxes, visited, components)
			}
			return
		}
	}

	// Function call: name( ... )
	if (RE_FUNCTION_CALL.test(cleaned)) {
		components.push({ kind: 'string' })
		return
	}

	// Data type reference: <name>
	const dtMatch = cleaned.match(RE_PROPERTY_REFERENCE)
	if (dtMatch) {
		// Property reference <'property-name'>
		const propName = dtMatch[1]
		if (!visited.has(`prop:${propName}`)) {
			visited.add(`prop:${propName}`)
			const propData = allProperties[propName]
			if (propData) {
				const resolved = parseSyntaxToTypes(propData.syntax, syntaxes, visited)
				components.push(...resolved)
			}
			else {
				components.push({ kind: 'string' })
			}
		}
		return
	}

	const dtMatch2 = cleaned.match(RE_DATA_TYPE_REFERENCE)
	if (dtMatch2) {
		const typeName = dtMatch2[1]
		resolveDataType(typeName, syntaxes, visited, components)
		return
	}

	// Numeric literal
	if (RE_NUMERIC_LITERAL.test(cleaned)) {
		components.push({ kind: 'number' })
		return
	}

	// Keyword (alphanumeric, dashes, no angle brackets or spaces)
	if (RE_KEYWORD_LITERAL.test(cleaned) && !cleaned.includes('<') && !cleaned.includes('>')) {
		components.push({ kind: 'literal', value: cleaned })
		return
	}

	// If we get here, it's something complex we can't parse simply
	components.push({ kind: 'string' })
}

function hasComplexCombinator(s: string): boolean {
	// Check if string has && or || at top level (not inside brackets)
	let depth = 0
	for (let i = 0; i < s.length; i++) {
		const ch = s[i]
		if (ch === '[' || ch === '(') {
			depth++
		}
		else if (ch === ']' || ch === ')') {
			depth--
		}
		else if (depth === 0) {
			if (ch === '&' && s[i + 1] === '&')
				return true
			if (ch === '|' && s[i + 1] === '|')
				return true
		}
	}

	// Check for juxtaposition: multiple space-separated terms at top level
	// (but not single <type> or keyword with multiplier)
	const tokens = tokenizeTopLevel(s)
	if (tokens.length > 1) {
		// Multiple terms juxtaposed = complex
		return true
	}

	return false
}

function tokenizeTopLevel(s: string): string[] {
	const tokens: string[] = []
	let depth = 0
	let current = ''
	for (let i = 0; i < s.length; i++) {
		const ch = s[i]
		if (ch === '[' || ch === '(' || ch === '<') {
			depth++
			current += ch
		}
		else if (ch === ']' || ch === ')' || ch === '>') {
			depth--
			current += ch
		}
		else if (depth === 0 && ch === ' ') {
			const trimmed = current.trim()
			if (trimmed)
				tokens.push(trimmed)
			current = ''
		}
		else {
			current += ch
		}
	}
	const trimmed = current.trim()
	if (trimmed)
		tokens.push(trimmed)

	// Filter out multipliers and operators
	return tokens.filter(t => t !== '&&' && t !== '||' && t !== '|' && !RE_MULTIPLIER_TOKEN.test(t))
}

function extractFromComplex(
	s: string,
	syntaxes: Record<string, ProcessedCssSyntax>,
	visited: Set<string>,
	components: TypeComponent[],
): void {
	// Extract data type references and keywords from complex expressions
	// Always add string fallback for complex combinator expressions
	components.push({ kind: 'string' })

	// Also extract named types that appear in the expression
	const typeRefs = s.matchAll(RE_COMPLEX_TYPE_REF)
	for (const m of typeRefs) {
		const typeName = m[1]
		if (KNOWN_DATA_TYPES[typeName]) {
			components.push({ kind: 'datatype', value: KNOWN_DATA_TYPES[typeName] })
		}
		else if (PRIMITIVE_TYPES[typeName]) {
			components.push({ kind: PRIMITIVE_TYPES[typeName] })
		}
	}

	// Extract property refs
	const propRefs = s.matchAll(RE_COMPLEX_PROPERTY_REF)
	for (const m of propRefs) {
		const propName = m[1]
		if (!visited.has(`prop:${propName}`)) {
			visited.add(`prop:${propName}`)
			const propData = allProperties[propName]
			if (propData) {
				const resolved = parseSyntaxToTypes(propData.syntax, syntaxes, visited)
				components.push(...resolved)
			}
		}
	}
}

function resolveDataType(
	typeName: string,
	syntaxes: Record<string, ProcessedCssSyntax>,
	visited: Set<string>,
	components: TypeComponent[],
): void {
	// Check primitive types first
	if (PRIMITIVE_TYPES[typeName]) {
		components.push({ kind: PRIMITIVE_TYPES[typeName] })
		return
	}

	// Check known data types
	if (KNOWN_DATA_TYPES[typeName]) {
		components.push({ kind: 'datatype', value: KNOWN_DATA_TYPES[typeName] })
		return
	}

	// Try to resolve from syntaxes
	const key = typeName.replace(RE_EMPTY_CALL_SUFFIX, '')
	if (visited.has(`type:${key}`))
		return

	visited.add(`type:${key}`)
	const syntaxDef = syntaxes[key] || syntaxes[typeName]
	if (syntaxDef) {
		const resolved = parseSyntaxToTypes(syntaxDef.syntax, syntaxes, visited)
		components.push(...resolved)
		return
	}

	// Unknown type → string fallback
	components.push({ kind: 'string' })
}

// ---------------------------------------------------------------------------
// 3. TYPE RESOLVER
// ---------------------------------------------------------------------------

interface ResolvedPropertyType {
	name: string
	camelName: string
	pascalName: string
	components: TypeComponent[]
	needsLength: boolean
	needsTime: boolean
	syntax: string
	initial: string | string[]
	inherited: boolean
	mdnUrl?: string
	status?: string
	compatibility?: ProcessedCssCompatibility
	sourcePresence?: ProcessedCssSourcePresence
}

function toCamelCase(kebab: string): string {
	let result = kebab
	let prefix = ''

	const vendorMatch = result.match(RE_VENDOR_PREFIX)
	if (vendorMatch) {
		const vendorPrefix = vendorMatch[1]
		prefix = vendorPrefix === 'ms'
			? 'ms'
			: vendorPrefix.charAt(0)
				.toUpperCase() + vendorPrefix.slice(1)
		result = result.slice(vendorMatch[0].length)
		// Capitalize first letter of remainder for vendor-prefixed properties
		result = result.charAt(0)
			.toUpperCase() + result.slice(1)
	}

	// Convert remaining kebab-case to camelCase
	result = result.replace(RE_KEBAB_SEGMENT, (_, c: string) => c.toUpperCase())

	return prefix + result
}

function toPascalCase(kebab: string): string {
	const camel = toCamelCase(kebab)
	return camel.charAt(0)
		.toUpperCase() + camel.slice(1)
}

function resolveAllProperties(): ResolvedPropertyType[] {
	const result: ResolvedPropertyType[] = []

	for (const [name, data] of Object.entries(allProperties)) {
		const components = parseSyntaxToTypes(data.syntax, patchedSyntaxes)
		const needsLength = components.some(c => c.kind === 'length' || hasLengthInDataType(c))
		const needsTime = components.some(c => c.kind === 'time' || hasTimeInDataType(c))

		result.push({
			name,
			camelName: toCamelCase(name),
			pascalName: toPascalCase(name),
			components,
			needsLength,
			needsTime,
			syntax: data.syntax,
			initial: data.initial,
			inherited: data.inherited,
			mdnUrl: data.mdnUrl,
			status: data.status,
			compatibility: data.compatibility,
			sourcePresence: data.sourcePresence,
		})
	}

	result.sort((a, b) => a.camelName.localeCompare(b.camelName))
	return result
}

/** Check if a DataType reference involves TLength */
function hasLengthInDataType(c: TypeComponent): boolean {
	if (c.kind !== 'datatype' || !c.value)
		return false
	const lengthTypes = new Set([
		'LineWidth',
		'Position',
		'BgPosition',
		'BgSize',
		'BgLayer',
		'FinalBgLayer',
		'MaskLayer',
		'TrackBreadth',
		'Dasharray',
		'GridLine',
	])
	return lengthTypes.has(c.value)
}

/** Check if a DataType reference involves TTime */
function hasTimeInDataType(c: TypeComponent): boolean {
	if (c.kind !== 'datatype' || !c.value)
		return false
	const timeTypes = new Set([
		'SingleAnimation',
		'SingleTransition',
	])
	return timeTypes.has(c.value)
}

// ---------------------------------------------------------------------------
// 4. TYPE STRING BUILDER
// ---------------------------------------------------------------------------

function componentToTypeString(c: TypeComponent, hasGenerics: { length: boolean, time: boolean }): string {
	switch (c.kind) {
		case 'literal':
			return `"${c.value}"`
		case 'number':
			return 'UnionString'
		case 'string':
			return 'UnionString'
		case 'length':
			return hasGenerics.length ? 'TLength' : 'UnionString | 0'
		case 'time':
			return hasGenerics.time ? 'TTime' : 'UnionString'
		case 'datatype': {
			const dt = c.value!
			// Check if this datatype needs generics
			const needsLength = hasLengthInDataType(c)
			const needsTime = hasTimeInDataType(c)
			if (needsLength && needsTime)
				return `DataType.${dt}<TLength, TTime>`
			if (needsLength)
				return `DataType.${dt}<TLength>`
			if (needsTime)
				return `DataType.${dt}<TTime>`
			return `DataType.${dt}`
		}
		default:
			return 'UnionString'
	}
}

function buildPropertyTypeString(prop: ResolvedPropertyType, withGenerics: boolean): string {
	const hasGenerics = {
		length: withGenerics && prop.needsLength,
		time: withGenerics && prop.needsTime,
	}

	const parts = new Set<string>()
	parts.add('Globals')

	for (const c of prop.components) {
		const component = componentToTypeString(c, hasGenerics)
		// Keep generated property families closed by default. Authoring openness
		// is added later in core/types.ts, where arbitrary CSS input is needed.
		if (component === 'UnionString')
			continue
		parts.add(component)
	}

	return Array.from(parts)
		.join(' | ')
}

function buildPropertyGenericParams(prop: ResolvedPropertyType, withDefaults: boolean): string {
	const params: string[] = []
	if (prop.needsLength) {
		params.push(withDefaults ? 'TLength = DefaultTLength' : 'TLength')
	}
	if (prop.needsTime) {
		params.push(withDefaults ? 'TTime = DefaultTTime' : 'TTime')
	}
	return params.length > 0 ? `<${params.join(', ')}>` : ''
}

function buildClosedGeneratedUnion(definition: string): string {
	const parts = definition.split(' | ')
		.map(part => part.trim())
		.filter(part => part !== 'UnionString')

	return parts.join(' | ')
}

// ---------------------------------------------------------------------------
// 5. JSDOC GENERATOR
// ---------------------------------------------------------------------------

function formatBaselineDate(dateStr: string): string {
	const date = new Date(dateStr)
	if (Number.isNaN(date.getTime()))
		return dateStr
	const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
	return `${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

export function getBaselineStatus(compatibility: ProcessedCssCompatibility | undefined): string {
	if (!compatibility)
		return ''

	if (compatibility.baseline.level === 'high') {
		const since = compatibility.baseline.baselineHighDate ? ` (since ${formatBaselineDate(compatibility.baseline.baselineHighDate)})` : ''
		return `✅ Baseline: Widely available${since}`
	}
	if (compatibility.baseline.level === 'low') {
		const since = compatibility.baseline.baselineLowDate ? ` (since ${formatBaselineDate(compatibility.baseline.baselineLowDate)})` : ''
		return `⚠️ Baseline: Newly available${since}`
	}
	if (compatibility.baseline.level === false)
		return '❌ Baseline: Not widely available'

	return ''
}

// ---------------------------------------------------------------------------
// 6. PSEUDOS AND AT-RULES
// ---------------------------------------------------------------------------

function collectPseudos(): string[] {
	const pseudos = new Set<string>()

	for (const name of Object.keys(processedSelectors)) {
		if (name.startsWith(':')) {
			pseudos.add(name)
		}
	}

	return Array.from(pseudos)
		.sort()
}

export function collectAtRulesFromProcessedData(atRules: Record<string, ProcessedCssAtRule>): { regular: string[], nested: string[] } {
	const regularAtRules = new Set<string>()
	const nestedAtRules = new Set<string>()

	for (const [name, data] of Object.entries(atRules)) {
		if (name.startsWith('@')) {
			if (data.kind === 'nested') {
				nestedAtRules.add(name)

				if (data.syntax.includes(' {\n') && data.syntax.endsWith('\n}') === false) {
					regularAtRules.add(name)
				}

				continue
			}

			if (data.kind === 'regular') {
				regularAtRules.add(name)
				continue
			}

			const syntax = data.syntax
			if (syntax.includes(' {\n') && syntax.includes('\n}')) {
				nestedAtRules.add(name)

				// Special case for @layer, which has either nested or regular syntax
				if (syntax.endsWith('\n}') === false) {
					regularAtRules.add(name)
				}
			}
			else {
				regularAtRules.add(name)
			}
		}
	}

	return {
		regular: Array
			.from(regularAtRules)
			.sort(),
		nested: Array
			.from(nestedAtRules)
			.sort(),
	}
}

function collectAtRules(): { regular: string[], nested: string[] } {
	return collectAtRulesFromProcessedData(processedAtRules)
}

// ---------------------------------------------------------------------------
// 7. DATA TYPE DEFINITIONS (hardcoded)
// ---------------------------------------------------------------------------

const DATA_TYPE_DEFINITIONS: Record<string, string> = {
	'AbsoluteSize': '"large" | "medium" | "small" | "x-large" | "x-small" | "xx-large" | "xx-small" | "xxx-large"',
	'AnimateableFeature': '"contents" | "scroll-position" | UnionString',
	'Attachment': '"fixed" | "local" | "scroll"',
	'Autospace': '"ideograph-alpha" | "ideograph-numeric" | "insert" | "no-autospace" | "punctuation" | "replace" | UnionString',
	'BgClip': 'VisualBox | "border-area" | "text"',
	'BgLayer<TLength>': 'BgPosition<TLength> | RepeatStyle | Attachment | VisualBox | "none" | UnionString',
	'BgPosition<TLength>': 'TLength | "bottom" | "center" | "left" | "right" | "top" | UnionString',
	'BgSize<TLength>': 'TLength | "auto" | "contain" | "cover" | UnionString',
	'BlendMode': '"color" | "color-burn" | "color-dodge" | "darken" | "difference" | "exclusion" | "hard-light" | "hue" | "lighten" | "luminosity" | "multiply" | "normal" | "overlay" | "saturation" | "screen" | "soft-light"',
	'Color': 'ColorBase | SystemColor | DeprecatedSystemColor | "currentColor" | UnionString',
	'ColorBase': 'NamedColor | "transparent" | UnionString',
	'CompatAuto': '"button" | "checkbox" | "listbox" | "menulist" | "meter" | "progress-bar" | "radio" | "searchfield" | "textarea"',
	'CompositeStyle': '"clear" | "copy" | "destination-atop" | "destination-in" | "destination-out" | "destination-over" | "source-atop" | "source-in" | "source-out" | "source-over" | "xor"',
	'CompositingOperator': '"add" | "exclude" | "intersect" | "subtract"',
	'ContentDistribution': '"space-around" | "space-between" | "space-evenly" | "stretch"',
	'ContentPosition': '"center" | "end" | "flex-end" | "flex-start" | "start"',
	'CubicBezierEasingFunction': '"ease" | "ease-in" | "ease-in-out" | "ease-out" | UnionString',
	'CursorPredefined': '"alias" | "all-scroll" | "auto" | "cell" | "col-resize" | "context-menu" | "copy" | "crosshair" | "default" | "e-resize" | "ew-resize" | "grab" | "grabbing" | "help" | "move" | "n-resize" | "ne-resize" | "nesw-resize" | "no-drop" | "none" | "not-allowed" | "ns-resize" | "nw-resize" | "nwse-resize" | "pointer" | "progress" | "row-resize" | "s-resize" | "se-resize" | "sw-resize" | "text" | "vertical-text" | "w-resize" | "wait" | "zoom-in" | "zoom-out"',
	'Dasharray<TLength>': 'TLength | UnionString',
	'DeprecatedSystemColor': '"ActiveBorder" | "ActiveCaption" | "AppWorkspace" | "Background" | "ButtonHighlight" | "ButtonShadow" | "CaptionText" | "InactiveBorder" | "InactiveCaption" | "InactiveCaptionText" | "InfoBackground" | "InfoText" | "Menu" | "MenuText" | "Scrollbar" | "ThreeDDarkShadow" | "ThreeDFace" | "ThreeDHighlight" | "ThreeDLightShadow" | "ThreeDShadow" | "Window" | "WindowFrame" | "WindowText"',
	'DisplayInside': '"-ms-flexbox" | "-ms-grid" | "-webkit-flex" | "flex" | "flow" | "flow-root" | "grid" | "ruby" | "table"',
	'DisplayInternal': '"ruby-base" | "ruby-base-container" | "ruby-text" | "ruby-text-container" | "table-caption" | "table-cell" | "table-column" | "table-column-group" | "table-footer-group" | "table-header-group" | "table-row" | "table-row-group"',
	'DisplayLegacy': '"-ms-inline-flexbox" | "-ms-inline-grid" | "-webkit-inline-flex" | "inline-block" | "inline-flex" | "inline-grid" | "inline-list-item" | "inline-table"',
	'DisplayOutside': '"block" | "inline" | "run-in"',
	'EasingFunction': 'CubicBezierEasingFunction | StepEasingFunction | "linear" | UnionString',
	'EastAsianVariantValues': '"jis04" | "jis78" | "jis83" | "jis90" | "simplified" | "traditional"',
	'FinalBgLayer<TLength>': 'BgPosition<TLength> | RepeatStyle | Attachment | VisualBox | Color | "none" | UnionString',
	'FontStretchAbsolute': '"condensed" | "expanded" | "extra-condensed" | "extra-expanded" | "normal" | "semi-condensed" | "semi-expanded" | "ultra-condensed" | "ultra-expanded" | UnionString',
	'FontWeightAbsolute': '"bold" | "normal" | UnionString',
	'GenericComplete': '"-apple-system" | "cursive" | "fantasy" | "math" | "monospace" | "sans-serif" | "serif" | "system-ui"',
	'GenericFamily': 'GenericComplete | GenericIncomplete | "emoji" | "fangsong"',
	'GenericIncomplete': '"ui-monospace" | "ui-rounded" | "ui-sans-serif" | "ui-serif"',
	'GeometryBox': 'VisualBox | "fill-box" | "margin-box" | "stroke-box" | "view-box"',
	'GridLine': '"auto" | UnionString',
	'LineStyle': '"dashed" | "dotted" | "double" | "groove" | "hidden" | "inset" | "none" | "outset" | "ridge" | "solid"',
	'LineWidth<TLength>': 'TLength | "medium" | "thick" | "thin"',
	'MaskLayer<TLength>': 'Position<TLength> | RepeatStyle | GeometryBox | CompositingOperator | MaskingMode | "no-clip" | "none" | UnionString',
	'MaskingMode': '"alpha" | "luminance" | "match-source"',
	'NamedColor': '"aliceblue" | "antiquewhite" | "aqua" | "aquamarine" | "azure" | "beige" | "bisque" | "black" | "blanchedalmond" | "blue" | "blueviolet" | "brown" | "burlywood" | "cadetblue" | "chartreuse" | "chocolate" | "coral" | "cornflowerblue" | "cornsilk" | "crimson" | "cyan" | "darkblue" | "darkcyan" | "darkgoldenrod" | "darkgray" | "darkgreen" | "darkgrey" | "darkkhaki" | "darkmagenta" | "darkolivegreen" | "darkorange" | "darkorchid" | "darkred" | "darksalmon" | "darkseagreen" | "darkslateblue" | "darkslategray" | "darkslategrey" | "darkturquoise" | "darkviolet" | "deeppink" | "deepskyblue" | "dimgray" | "dimgrey" | "dodgerblue" | "firebrick" | "floralwhite" | "forestgreen" | "fuchsia" | "gainsboro" | "ghostwhite" | "gold" | "goldenrod" | "gray" | "green" | "greenyellow" | "grey" | "honeydew" | "hotpink" | "indianred" | "indigo" | "ivory" | "khaki" | "lavender" | "lavenderblush" | "lawngreen" | "lemonchiffon" | "lightblue" | "lightcoral" | "lightcyan" | "lightgoldenrodyellow" | "lightgray" | "lightgreen" | "lightgrey" | "lightpink" | "lightsalmon" | "lightseagreen" | "lightskyblue" | "lightslategray" | "lightslategrey" | "lightsteelblue" | "lightyellow" | "lime" | "limegreen" | "linen" | "magenta" | "maroon" | "mediumaquamarine" | "mediumblue" | "mediumorchid" | "mediumpurple" | "mediumseagreen" | "mediumslateblue" | "mediumspringgreen" | "mediumturquoise" | "mediumvioletred" | "midnightblue" | "mintcream" | "mistyrose" | "moccasin" | "navajowhite" | "navy" | "oldlace" | "olive" | "olivedrab" | "orange" | "orangered" | "orchid" | "palegoldenrod" | "palegreen" | "paleturquoise" | "palevioletred" | "papayawhip" | "peachpuff" | "peru" | "pink" | "plum" | "powderblue" | "purple" | "rebeccapurple" | "red" | "rosybrown" | "royalblue" | "saddlebrown" | "salmon" | "sandybrown" | "seagreen" | "seashell" | "sienna" | "silver" | "skyblue" | "slateblue" | "slategray" | "slategrey" | "snow" | "springgreen" | "steelblue" | "tan" | "teal" | "thistle" | "tomato" | "turquoise" | "violet" | "wheat" | "white" | "whitesmoke" | "yellow" | "yellowgreen"',
	'OutlineLineStyle': '"dashed" | "dotted" | "double" | "groove" | "inset" | "none" | "outset" | "ridge" | "solid"',
	'PageSize': '"A3" | "A4" | "A5" | "B4" | "B5" | "JIS-B4" | "JIS-B5" | "ledger" | "legal" | "letter"',
	'Paint': 'Color | "context-fill" | "context-stroke" | "none" | UnionString',
	'PaintBox': 'VisualBox | "fill-box" | "stroke-box"',
	'Position<TLength>': 'TLength | "bottom" | "center" | "left" | "right" | "top" | UnionString',
	'PositionArea': '"block-end" | "block-start" | "bottom" | "center" | "end" | "inline-end" | "inline-start" | "left" | "right" | "self-block-end" | "self-block-start" | "self-end" | "self-inline-end" | "self-inline-start" | "self-start" | "span-all" | "span-block-end" | "span-block-start" | "span-bottom" | "span-end" | "span-inline-end" | "span-inline-start" | "span-left" | "span-right" | "span-self-block-end" | "span-self-block-start" | "span-self-end" | "span-self-inline-end" | "span-self-inline-start" | "span-self-start" | "span-start" | "span-top" | "span-x-end" | "span-x-self-end" | "span-x-self-start" | "span-x-start" | "span-y-end" | "span-y-self-end" | "span-y-self-start" | "span-y-start" | "start" | "top" | "x-end" | "x-self-end" | "x-self-start" | "x-start" | "y-end" | "y-self-end" | "y-self-start" | "y-start" | UnionString',
	'Quote': '"close-quote" | "no-close-quote" | "no-open-quote" | "open-quote"',
	'RepeatStyle': '"no-repeat" | "repeat" | "repeat-x" | "repeat-y" | "round" | "space" | UnionString',
	'SelfPosition': '"center" | "end" | "flex-end" | "flex-start" | "self-end" | "self-start" | "start"',
	'SingleAnimation<TTime>': 'EasingFunction | SingleAnimationDirection | SingleAnimationFillMode | SingleAnimationTimeline | TTime | "auto" | "infinite" | "none" | "paused" | "running" | UnionString',
	'SingleAnimationComposition': '"accumulate" | "add" | "replace"',
	'SingleAnimationDirection': '"alternate" | "alternate-reverse" | "normal" | "reverse"',
	'SingleAnimationFillMode': '"backwards" | "both" | "forwards" | "none"',
	'SingleAnimationTimeline': '"auto" | "none" | UnionString',
	'SingleTransition<TTime>': 'EasingFunction | TTime | "all" | "allow-discrete" | "none" | "normal" | UnionString',
	'StepEasingFunction': '"step-end" | "step-start" | UnionString',
	'SystemColor': '"AccentColor" | "AccentColorText" | "ActiveText" | "ButtonBorder" | "ButtonFace" | "ButtonText" | "Canvas" | "CanvasText" | "Field" | "FieldText" | "GrayText" | "Highlight" | "HighlightText" | "LinkText" | "Mark" | "MarkText" | "SelectedItem" | "SelectedItemText" | "VisitedText"',
	'SystemFamilyName': '"caption" | "icon" | "menu" | "message-box" | "small-caption" | "status-bar"',
	'TextEdge': '"cap" | "ex" | "ideographic" | "ideographic-ink" | "text" | UnionString',
	'TimelineRangeName': '"contain" | "cover" | "entry" | "entry-crossing" | "exit" | "exit-crossing"',
	'TrackBreadth<TLength>': 'TLength | "auto" | "max-content" | "min-content" | UnionString',
	'TrySize': '"most-block-size" | "most-height" | "most-inline-size" | "most-width"',
	'TryTactic': '"flip-block" | "flip-inline" | "flip-start" | UnionString',
	'VisualBox': '"border-box" | "content-box" | "padding-box"',
}

const MAX_DISPLAYED_KEYWORDS = 20

function collectKeywordsFromDataType(typeName: string, keywords: Set<string>, visited: Set<string>): void {
	const baseName = typeName.replace(RE_GENERIC_SUFFIX, '')
	if (visited.has(baseName))
		return
	visited.add(baseName)

	const def = DATA_TYPE_DEFINITIONS[typeName]
		|| DATA_TYPE_DEFINITIONS[`${baseName}<TLength>`]
		|| DATA_TYPE_DEFINITIONS[`${baseName}<TTime>`]
		|| DATA_TYPE_DEFINITIONS[`${baseName}<TLength, TTime>`]
		|| DATA_TYPE_DEFINITIONS[baseName]

	if (!def)
		return

	const literalMatches = def.matchAll(RE_QUOTED_LITERAL)
	for (const m of literalMatches) {
		keywords.add(m[1])
	}

	const parts = def.split('|')
		.map((p: string) => p.trim())
	for (const part of parts) {
		if (part.startsWith('"') || part === 'UnionString' || part === 'TLength' || part === 'TTime')
			continue
		const refName = part.replace(RE_GENERIC_SUFFIX, '')
		if (refName && RE_UPPERCASE_START.test(refName)) {
			collectKeywordsFromDataType(refName, keywords, visited)
		}
	}
}

function extractAllKeywords(components: TypeComponent[]): string[] {
	const keywords = new Set<string>()
	const visited = new Set<string>()

	for (const c of components) {
		if (c.kind === 'literal' && c.value != null) {
			keywords.add(c.value)
		}
		else if (c.kind === 'datatype' && c.value) {
			collectKeywordsFromDataType(c.value, keywords, visited)
		}
	}

	return [...keywords].sort()
}

function generateJSDoc(prop: ResolvedPropertyType): string {
	const lines: string[] = []
	lines.push('  /**')

	// Baseline status
	const baseline = getBaselineStatus(prop.compatibility)
	if (baseline) {
		lines.push(`   * ${baseline}`)
	}

	// Keyword values - fully expanded from components and DataType definitions
	const allKeywords = extractAllKeywords(prop.components)
	if (allKeywords.length > 0) {
		lines.push(`   *`)
		if (allKeywords.length <= MAX_DISPLAYED_KEYWORDS) {
			lines.push(`   * 🔑 Values: ${allKeywords.map(k => `\`${k}\``)
				.join(' | ')}`)
		}
		else {
			const shown = allKeywords.slice(0, MAX_DISPLAYED_KEYWORDS)
			lines.push(`   * 🔑 Values: ${shown.map(k => `\`${k}\``)
				.join(' | ')}, ... and ${allKeywords.length - MAX_DISPLAYED_KEYWORDS} more`)
		}
	}

	// Source provenance markers
	if (prop.sourcePresence) {
		const sp = prop.sourcePresence
		const markers = [
			`webref ${sp.webref ? '✓' : '✗'}`,
			`mdn-data ${sp.mdnData ? '✓' : '✗'}`,
			`BCD ${sp.bcd ? '✓' : '✗'}`,
			`web-features ${sp.webFeatures ? '✓' : '✗'}`,
		]
		lines.push(`   *`)
		lines.push(`   * 📦 Sources: ${markers.join(' | ')}`)
	}

	// Deprecated / Experimental tags
	if (prop.compatibility?.deprecated) {
		lines.push(`   *`)
		lines.push(`   * @deprecated`)
	}
	if (prop.compatibility?.experimental) {
		lines.push(`   *`)
		lines.push(`   * @experimental`)
	}

	// MDN URL
	if (prop.mdnUrl) {
		lines.push(`   *`)
		lines.push(`   * @see ${prop.mdnUrl}`)
	}

	lines.push(`   */`)
	return lines.join('\n')
}

// ---------------------------------------------------------------------------
// 8. CODE EMITTER
// ---------------------------------------------------------------------------

function emitOutput(properties: ResolvedPropertyType[]): string {
	const lines: string[] = []

	// Header
	lines.push('// This file is auto-generated by scripts/css-data/generate-csstype.ts')
	lines.push('// DO NOT EDIT MANUALLY')
	lines.push('')
	lines.push('export {}')
	lines.push('')
	lines.push('type UnionString = string & {};')
	lines.push('type DefaultTLength = UnionString | 0;')
	lines.push('type DefaultTTime = UnionString;')
	lines.push('')

	// Globals
	lines.push('export type Globals = "-moz-initial" | "inherit" | "initial" | "revert" | "revert-layer" | "unset";')
	lines.push('')

	// Properties interface (camelCase)
	lines.push('export interface Properties<TLength = DefaultTLength, TTime = DefaultTTime> {')
	for (const prop of properties) {
		const jsdoc = generateJSDoc(prop)
		const typeStr = buildPropertyTypeRef(prop, true)
		lines.push(jsdoc)
		lines.push(`  ${prop.camelName}?: ${typeStr} | undefined;`)
	}
	lines.push('}')
	lines.push('')
	lines.push('export interface PropertyRelatedNames {')
	for (const prop of properties) {
		const relatedKeys = `${JSON.stringify(prop.camelName)} | ${JSON.stringify(prop.name)}`
		lines.push(`  ${prop.camelName}: ${relatedKeys};`)
	}
	lines.push('}')
	lines.push('')

	// PropertiesHyphen interface (kebab-case)
	lines.push('export interface PropertiesHyphen<TLength = DefaultTLength, TTime = DefaultTTime> {')
	const sortedByKebab = [...properties].sort((a, b) => a.name.localeCompare(b.name))
	for (const prop of sortedByKebab) {
		const jsdoc = generateJSDoc(prop)
		const typeStr = buildPropertyTypeRef(prop, true)
		lines.push(jsdoc)
		lines.push(`  "${prop.name}"?: ${typeStr} | undefined;`)
	}
	lines.push('}')
	lines.push('')
	lines.push('export interface PropertyHyphenRelatedNames {')
	for (const prop of sortedByKebab) {
		const relatedKeys = `${JSON.stringify(prop.name)} | ${JSON.stringify(prop.camelName)}`
		lines.push(`  ${JSON.stringify(prop.name)}: ${relatedKeys};`)
	}
	lines.push('}')
	lines.push('')

	// AtRules
	const {
		regular: regularAtRules,
		nested: nestedAtRules,
	} = collectAtRules()
	lines.push('export namespace AtRules {')
	lines.push('  export type Regular =')
	for (let i = 0; i < regularAtRules.length; i++) {
		const sep = i === regularAtRules.length - 1 ? ';' : ''
		lines.push(`    | "${regularAtRules[i]}"${sep}`)
	}
	lines.push('')
	lines.push('  export type Nested =')
	for (let i = 0; i < nestedAtRules.length; i++) {
		const sep = i === nestedAtRules.length - 1 ? ';' : ''
		lines.push(`    | "${nestedAtRules[i]}"${sep}`)
	}
	lines.push('}')
	lines.push('')

	lines.push('export type AtRules = AtRules.Regular | AtRules.Nested;')
	lines.push('')

	// Pseudos
	const pseudos = collectPseudos()
	lines.push('export type Pseudos =')
	for (let i = 0; i < pseudos.length; i++) {
		const sep = i === pseudos.length - 1 ? ';' : ''
		lines.push(`  | "${pseudos[i]}"${sep}`)
	}
	lines.push('')

	// CSSPseudos (pre-expanded with `$` prefix)
	lines.push('export type CSSPseudos =')
	for (let i = 0; i < pseudos.length; i++) {
		const sep = i === pseudos.length - 1 ? ';' : ''
		lines.push(`  | "$${pseudos[i]}"${sep}`)
	}
	lines.push('')

	// Autocomplete utility types
	lines.push('type AutocompleteLookup<TValueMap, TRelatedKeys extends string> = [TValueMap] extends [never] ? never : TRelatedKeys extends keyof TValueMap ? TValueMap[TRelatedKeys] : never;')
	lines.push('type PropertyInputAtom<TValueMap, BaseValue, TRelatedKeys extends string> = UnionString | BaseValue | AutocompleteLookup<TValueMap, TRelatedKeys | "*">;')
	lines.push('/** CSS property input value with optional Typegen autocomplete and fallback values. */')
	lines.push('export type PropertyInputValue<TValueMap, BaseValue, TRelatedKeys extends string = never> =')
	lines.push('  | PropertyInputAtom<TValueMap, BaseValue, TRelatedKeys>')
	lines.push('  | [value: PropertyInputAtom<TValueMap, BaseValue, TRelatedKeys>, fallback: Array<PropertyInputAtom<TValueMap, BaseValue, TRelatedKeys>>]')
	lines.push('  | null')
	lines.push('  | undefined;')
	lines.push('')

	// PropertiesInput interface (camelCase)
	lines.push('/** Camel-case CSS property inputs used by the generated Typegen style definition. */')
	lines.push('export interface PropertiesInput<TValueMap = never, TLength = DefaultTLength, TTime = DefaultTTime> {')
	for (const prop of properties) {
		const jsdoc = generateJSDoc(prop)
		const typeRef = buildPropertyTypeRef(prop, true)
		lines.push(jsdoc)
		lines.push(`  ${prop.camelName}?: PropertyInputValue<TValueMap, ${typeRef}, PropertyRelatedNames[${JSON.stringify(prop.camelName)}]> | undefined;`)
	}
	lines.push('}')
	lines.push('')

	// PropertiesHyphenInput interface (kebab-case)
	lines.push('/** Kebab-case CSS property inputs used by the generated Typegen style definition. */')
	lines.push('export interface PropertiesHyphenInput<TValueMap = never, TLength = DefaultTLength, TTime = DefaultTTime> {')
	for (const prop of sortedByKebab) {
		const jsdoc = generateJSDoc(prop)
		const typeRef = buildPropertyTypeRef(prop, true)
		lines.push(jsdoc)
		lines.push(`  ${JSON.stringify(prop.name)}?: PropertyInputValue<TValueMap, ${typeRef}, PropertyHyphenRelatedNames[${JSON.stringify(prop.name)}]> | undefined;`)
	}
	lines.push('}')
	lines.push('')

	// Property namespace
	lines.push('export namespace Property {')
	for (const prop of properties) {
		const generics = buildPropertyGenericParams(prop, true)
		const typeStr = buildPropertyTypeString(prop, true)
		lines.push(`  export type ${prop.pascalName}${generics} = ${typeStr};`)
		lines.push('')
	}
	lines.push('}')
	lines.push('')

	// DataType namespace
	lines.push('export namespace DataType {')
	const sortedDTKeys = Object.keys(DATA_TYPE_DEFINITIONS)
		.sort((a, b) => {
			const aName = a.replace(RE_GENERIC_SUFFIX, '')
			const bName = b.replace(RE_GENERIC_SUFFIX, '')
			return aName.localeCompare(bName)
		})
	for (const key of sortedDTKeys) {
		const def = buildClosedGeneratedUnion(DATA_TYPE_DEFINITIONS[key]!)
		lines.push(`  export type ${key} = ${def};`)
		lines.push('')
	}
	lines.push('}')
	lines.push('')

	return lines.join('\n')
}

export function generateCssTypeOutput(): string {
	return emitOutput(resolveAllProperties())
}

function buildPropertyTypeRef(prop: ResolvedPropertyType, _fromInterface: boolean): string {
	const genericArgs: string[] = []
	if (prop.needsLength)
		genericArgs.push('TLength')
	if (prop.needsTime)
		genericArgs.push('TTime')

	const generics = genericArgs.length > 0 ? `<${genericArgs.join(', ')}>` : ''
	return `Property.${prop.pascalName}${generics}`
}

// ---------------------------------------------------------------------------
// 9. MAIN
// ---------------------------------------------------------------------------

function main(): void {
	console.log('Resolving CSS properties...')
	const properties = resolveAllProperties()
	console.log(`  ${properties.length} properties resolved`)

	const pseudos = collectPseudos()
	console.log(`  ${pseudos.length} pseudo-selectors collected`)

	const { regular: regularAtRules, nested: nestedAtRules } = collectAtRules()
	console.log(`  ${regularAtRules.length + nestedAtRules.length} at-rules collected`)

	console.log('Generating output...')
	const output = emitOutput(properties)

	fs.writeFileSync(OUTPUT_PATH, output, 'utf-8')
	console.log(`Written to ${OUTPUT_PATH}`)
	console.log(`  ${output.split('\n').length} lines`)
	console.log('Done!')
}

if (process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href) {
	if (process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href) {
		main()
	}
}
