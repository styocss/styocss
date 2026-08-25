import type { CSSStyleBlockBody, CSSStyleBlocks, InternalPropertyValue } from './types'

/**
 * Creates a scoped logger with configurable log-level functions and a toggleable debug mode.
 *
 * @param prefix - Label prepended to every log message (e.g. `'[PikaCSS]'`).
 * @returns A logger object with `debug`, `info`, `warn`, `error` methods and configuration setters.
 *
 * @remarks All output handlers are no-ops by default, and debug messages are additionally disabled. Hosts may install output functions through the `set*Fn` methods; engine warnings and errors are reported through `createEngine(..., { onDiagnostic })` instead.
 *
 * @example
 * ```ts
 * const log = createLogger('[MyPlugin]')
 * log.info('initialized')  // '[MyPlugin][INFO] initialized'
 * log.toggleDebug()
 * log.debug('verbose info') // '[MyPlugin][DEBUG] verbose info'
 * ```
 */
export function createLogger(prefix: string) {
	let currentPrefix = prefix
	let enabledDebug = false
	const noop = (_prefix: string, ..._args: unknown[]) => {}
	let _debug: (prefix: string, ...args: unknown[]) => void = noop
	let _info: (prefix: string, ...args: unknown[]) => void = noop
	let _warn: (prefix: string, ...args: unknown[]) => void = noop
	let _error: (prefix: string, ...args: unknown[]) => void = noop

	const log: {
		debug: (...args: unknown[]) => void
		info: (...args: unknown[]) => void
		warn: (...args: unknown[]) => void
		error: (...args: unknown[]) => void
		toggleDebug: () => void
		setPrefix: (newPrefix: string) => void
		setDebugFn: (fn: (prefix: string, ...args: unknown[]) => void) => void
		setInfoFn: (fn: (prefix: string, ...args: unknown[]) => void) => void
		setWarnFn: (fn: (prefix: string, ...args: unknown[]) => void) => void
		setErrorFn: (fn: (prefix: string, ...args: unknown[]) => void) => void
	} = {
		debug: (...args: unknown[]) => {
			if (!enabledDebug)
				return
			_debug(`${currentPrefix}[DEBUG]`, ...args)
		},
		info: (...args: unknown[]) => {
			_info(`${currentPrefix}[INFO]`, ...args)
		},
		warn: (...args: unknown[]) => {
			_warn(`${currentPrefix}[WARN]`, ...args)
		},
		error: (...args: unknown[]) => {
			_error(`${currentPrefix}[ERROR]`, ...args)
		},
		toggleDebug() {
			enabledDebug = !enabledDebug
		},
		setPrefix(newPrefix: string) {
			currentPrefix = newPrefix
		},
		setDebugFn(fn: (prefix: string, ...args: unknown[]) => void) {
			_debug = fn
		},
		setInfoFn(fn: (prefix: string, ...args: unknown[]) => void) {
			_info = fn
		},
		setWarnFn(fn: (prefix: string, ...args: unknown[]) => void) {
			_warn = fn
		},
		setErrorFn(fn: (prefix: string, ...args: unknown[]) => void) {
			_error = fn
		},
	}

	return log
}
/**
 * Default logger instance used throughout the PikaCSS core engine, prefixed with `[PikaCSS]`.
 *
 * @remarks Shared across all internal modules. Plugins and integration code can call `log.toggleDebug()` to enable verbose output during development.
 *
 * @example
 * ```ts
 * log.info('Engine created')
 * log.warn('Unknown layer detected')
 * ```
 */
export const log = createLogger('[PikaCSS]')

const chars = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ']
const numOfChars = chars.length
/**
 * Converts a non-negative integer to a compact alphabetic string using a bijective base-52 encoding (a-z, A-Z).
 * @internal
 *
 * @param num - The non-negative integer to encode.
 * @returns A short alphabetic string unique to the given integer.
 *
 * @remarks Used to generate compact, human-readable atomic style class IDs. The encoding is deterministic (the same number always produces the same string) and least-significant-digit first: `52` maps to `'aa'`, `53` to `'ba'`, and so on.
 *
 * @example
 * ```ts
 * numberToChars(0)  // 'a'
 * numberToChars(51) // 'Z'
 * numberToChars(52) // 'aa'
 * ```
 */
export function numberToChars(num: number) {
	if (num < numOfChars)
		return chars[num]!

	let result = ''
	let n = num
	// Handle the case when num >= numOfChars
	while (n >= 0) {
		result += chars[n % numOfChars]
		n = Math.floor(n / numOfChars) - 1
	}
	return result
}

const UPPER_CASE = /[A-Z]/g
/**
 * Converts a camelCase string to kebab-case at runtime. CSS custom properties (`--*`) are returned unchanged.
 * @internal
 *
 * @param str - The camelCase string to convert.
 * @returns The kebab-case equivalent of the input string.
 *
 * @remarks Runtime counterpart of the `ToKebab` type utility. Used during style extraction to normalize JavaScript-style property names to CSS property names.
 *
 * @example
 * ```ts
 * toKebab('backgroundColor') // 'background-color'
 * toKebab('--my-var')        // '--my-var'
 * ```
 */
export function toKebab(str: string) {
	if (str.startsWith('--'))
		return str
	return str.replace(UPPER_CASE, c => `-${c.toLowerCase()}`)
}

/**
 * Type-narrowing guard that returns `true` when the value is neither `null` nor `undefined`.
 * @internal
 *
 * @typeParam T - The type of the input value.
 * @param value - The value to test.
 * @returns `true` if the value is non-nullish, narrowing the type to `NonNullable<T>`.
 *
 * @remarks Commonly used as a `.filter()` predicate to strip nullish entries from arrays while preserving the narrowed type.
 *
 * @example
 * ```ts
 * [1, null, 2, undefined].filter(isNotNullish) // [1, 2] typed as number[]
 * ```
 */
export function isNotNullish<T>(value: T): value is NonNullable<T> {
	return value != null
}

/**
 * Type-narrowing guard that returns `true` when the value is a string.
 * @internal
 *
 * @param value - The value to test.
 * @returns `true` if the value is a `string`.
 *
 * @remarks Used in pipeline steps to distinguish between string-based style items (shortcuts / class names) and object-based style definitions.
 *
 * @example
 * ```ts
 * isString('hello') // true
 * isString(42)      // false
 * ```
 */
export function isString(value: unknown): value is string {
	return typeof value === 'string'
}

/**
 * Type-narrowing guard that returns `true` when the value is not a string, narrowing the type to `Exclude<V, string>`.
 * @internal
 *
 * @typeParam V - The union type of the input value.
 * @param value - The value to test.
 * @returns `true` if the value is not a `string`.
 *
 * @remarks Useful for filtering processed style items to separate resolved definition objects from unresolved string references.
 *
 * @example
 * ```ts
 * const items: (string | object)[] = ['btn', { color: 'red' }]
 * const objects = items.filter(isNotString) // [{ color: 'red' }]
 * ```
 */
export function isNotString<V>(value: V): value is Exclude<V, string> {
	return typeof value !== 'string'
}

/**
 * Type-narrowing guard that returns `true` when the value is a plain object record (non-null, non-array object).
 * @internal
 *
 * @param value - The value to test.
 * @returns `true` if the value is an object that is neither `null` nor an array, narrowing the type to `Record<string, unknown>`.
 *
 * @remarks Used to distinguish nested definition objects (variables, design tokens) from scalar values and arrays while walking configuration trees.
 *
 * @example
 * ```ts
 * isPlainObjectRecord({ a: 1 }) // true
 * isPlainObjectRecord([1, 2])   // false
 * isPlainObjectRecord(null)     // false
 * ```
 */
export function isPlainObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const REGEXP_SPECIAL_CHARS_RE = /[.*+?^${}()|[\]\\/-]/g

/**
 * Escapes regular expression special characters in a string so it can be embedded in a `RegExp` source as a literal match.
 * @internal
 *
 * @param value - The literal text to escape.
 * @returns The input with every regex special character prefixed by a backslash.
 *
 * @remarks Runtime substitute for `RegExp.escape()` (available in Node.js >= 24 but not yet typed by TypeScript 5.9). Escapes all regex syntax characters plus `/` and `-`; the extra escapes are identity escapes in non-`u`-flag patterns, so the result is safe to embed in the non-unicode-mode regexes built by the engine and integrations.
 *
 * @example
 * ```ts
 * escapeRegExp('i-icon?') // 'i\\-icon\\?'
 * new RegExp(`^${escapeRegExp('a.b')}$`).test('a.b') // true
 * ```
 */
export function escapeRegExp(value: string) {
	return value.replace(REGEXP_SPECIAL_CHARS_RE, '\\$&')
}

function isPropertyValueScalar(v: unknown): v is string | number {
	return typeof v === 'string' || typeof v === 'number'
}

/**
 * Tests whether a value conforms to the `InternalPropertyValue` shape: a string, a number, a `[value, fallback[]]` tuple, or nullish.
 * @internal
 *
 * @param v - The value to inspect.
 * @returns `true` if the value is a valid property value.
 *
 * @remarks During extraction, the engine uses this guard to distinguish CSS property values from nested selector objects or style item arrays. Numbers are accepted because the csstype-based input types allow numeric values such as `0`; they are converted to strings during value normalization.
 *
 * @example
 * ```ts
 * isPropertyValue('red')                  // true
 * isPropertyValue(0)                       // true
 * isPropertyValue(['red', ['blue']])       // true
 * isPropertyValue(['auto', [0]])           // true
 * isPropertyValue(null)                    // true
 * isPropertyValue({ color: 'red' })        // false
 * ```
 */
export function isPropertyValue(v: unknown): v is InternalPropertyValue {
	if (Array.isArray(v)) {
		return v.length === 2
			&& isPropertyValueScalar(v[0])
			&& Array.isArray(v[1])
			&& v[1].every(isPropertyValueScalar)
	}

	if (v == null)
		return true

	return isPropertyValueScalar(v)
}

/**
 * Applies a transform to the parts of a string outside quoted segments,
 * leaving single- and double-quoted content (e.g. attribute values) untouched.
 * @internal
 *
 * @param str - The string to scan.
 * @param transform - Transform applied to each unquoted segment.
 * @returns The reassembled string with transformed unquoted segments and untouched quoted segments.
 *
 * @remarks A backslash-escaped character is treated as a literal both inside and outside quoted segments, so a CSS-escaped quote in an identifier (e.g. `.it\'s`) never starts quoted-segment scanning.
 *
 * @example
 * ```ts
 * transformOutsideQuotes('[data-x="%"] %', s => s.replace(/%/g, 'pk-a'))
 * // '[data-x="%"] pk-a'
 * ```
 */
export function transformOutsideQuotes(str: string, transform: (segment: string) => string): string {
	let result = ''
	let segmentStart = 0
	for (let i = 0; i < str.length; i++) {
		const ch = str[i]!
		if (ch === '\\') {
			// Escaped character: literal, stays part of the current unquoted segment.
			i++
			continue
		}
		if (ch === '"' || ch === '\'') {
			result += transform(str.slice(segmentStart, i))
			let j = i + 1
			while (j < str.length && str[j] !== ch) {
				if (str[j] === '\\')
					j++
				j++
			}
			const end = Math.min(j, str.length - 1)
			result += str.slice(i, end + 1)
			i = end
			segmentStart = i + 1
		}
	}
	result += transform(str.slice(segmentStart))
	return result
}

/**
 * Serializes a value to a JSON string for use as a deterministic cache key.
 * @internal
 *
 * @param value - The value to serialize.
 * @returns The JSON string representation.
 *
 * @remarks Used to produce stable keys for selector chains and property content when building deduplication maps in the optimization pipeline.
 *
 * @example
 * ```ts
 * serialize(['.pk-%', 'color']) // '[[".pk-%"],"color"]'
 * ```
 */
export function serialize(value: unknown): string {
	return JSON.stringify(value)
}

/**
 * Adds one or more values to a `Set` and returns whether the set's size increased.
 * @internal
 *
 * @typeParam T - The element type of the set.
 * @param set - The target set to append to.
 * @param values - Values to add.
 * @returns `true` if at least one new element was added (the set grew).
 *
 * @remarks The boolean return lets callers detect whether adding values changed the set.
 *
 * @example
 * ```ts
 * const s = new Set(['a'])
 * addToSet(s, 'a', 'b') // true (added 'b')
 * addToSet(s, 'a')      // false (no change)
 * ```
 */
export function addToSet<T>(set: Set<T>, ...values: T[]) {
	const before = set.size
	values.forEach(value => set.add(value))
	return set.size !== before
}

/**
 * Serializes a `CSSStyleBlocks` tree into a CSS string, optionally formatted with indentation and newlines.
 *
 * @param blocks - The CSS block tree to render.
 * @param isFormatted - When `true`, output includes indentation and newlines for readability; when `false`, output is minified.
 * @param depth - Current nesting depth for indentation (defaults to `0`).
 * @returns The rendered CSS string.
 *
 * @remarks Recursively renders nested blocks (e.g. media queries wrapping selectors). Empty blocks (no properties and no children) are omitted from the output.
 *
 * @example
 * ```ts
 * const blocks: CSSStyleBlocks = new Map()
 * blocks.set('.pk-a', { properties: [{ property: 'color', value: 'red' }] })
 * renderCSSStyleBlocks(blocks, true)
 * // '.pk-a {\n  color: red;\n}'
 * ```
 */
export function renderCSSStyleBlocks(blocks: CSSStyleBlocks, isFormatted: boolean, depth = 0) {
	const blockIndent = isFormatted ? '  '.repeat(depth) : ''
	const blockBodyIndent = isFormatted ? '  '.repeat(depth + 1) : ''
	const selectorEnd = isFormatted ? ' ' : ''
	const propertySpace = isFormatted ? ' ' : ''
	const lineEnd = isFormatted ? '\n' : ''
	const lines: string[] = []
	blocks.forEach((blockBody, selector) => {
		if (hasRenderableBlockContent(blockBody) === false)
			return

		const { properties, children } = blockBody
		const childrenCss = (children != null && children.size > 0)
			? renderCSSStyleBlocks(children, isFormatted, depth + 1)
			: ''
		lines.push(...[
			`${blockIndent}${selector}${selectorEnd}{`,
			...properties.map(({ property, value }) => `${blockBodyIndent}${property}:${propertySpace}${value};`),
			...(childrenCss !== '' ? [childrenCss] : []),
			`${blockIndent}}`,
		])
	})
	return lines.join(lineEnd)
}

function hasRenderableBlockContent(blockBody: CSSStyleBlockBody): boolean {
	if (blockBody.properties.length > 0)
		return true
	if (blockBody.children == null)
		return false
	for (const child of blockBody.children.values()) {
		if (hasRenderableBlockContent(child))
			return true
	}
	return false
}
