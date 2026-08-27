/* eslint-disable no-template-curly-in-string -- fixtures contain source-text templates */

/**
 * #152 — compiler/ESLint static-extension source-grammar corpus.
 *
 * The compiler's Babel collector and the ESLint rule's ESTree validator run
 * these complete source fixtures independently. The corpus covers the
 * language-level contract only: a legal fixture must be accepted structurally
 * by both implementations, while a rejected fixture must be rejected by the
 * implementation phase that owns its bounded evaluation.
 *
 * `defer` marks a structurally legal fixture whose final bounded-static value
 * is intentionally outside ESLint's authority. The compiler checks its
 * extension root, traversal, terminal shape, and materialization during
 * Prepare; ESLint must not execute or guess those facts. This includes a
 * computed member key whose value flows from an extension terminal.
 */

export interface StaticExtensionCase {
	name: string
	source: string
	dialect?: 'ts'
	expected: 'accept' | 'reject' | 'defer'
}

export const STATIC_EXTENSION_CASES: StaticExtensionCase[] = [
	{
		name: 'dot chain inside a base argument',
		source: 'export const value = pika({ color: pika.theme.colors.primary })\n',
		expected: 'accept',
	},
	{
		name: 'static string and number bracket keys',
		source: 'export const value = pika({ color: pika[\'theme\'][\'colors\'][0] })\n',
		expected: 'accept',
	},
	{
		name: 'static computed key expression',
		source: 'export const value = pika({ color: pika[\'the\' + \'me\'].colors.primary })\n',
		expected: 'accept',
	},
	{
		name: 'engine-dependent extension controls a computed member key',
		source: 'export const value = pika({ color: pika[pika.keys.theme].colors.primary })\n',
		expected: 'defer',
	},
	{
		name: 'extensions compose through ordinary static positions',
		source: 'export const value = pika({ value: [pika.theme.value], text: `${pika.theme.label}`, ...pika.theme.options })\n',
		expected: 'defer',
	},
	{
		name: 'extension-controlled logical reachability is deferred',
		source: 'export const value = pika({ value: pika.theme.enabled && dynamicValue })\n',
		expected: 'defer',
	},
	{
		name: 'extension-controlled conditional reachability is deferred',
		source: 'export const value = pika({ value: pika.theme.enabled ? dynamicValue : \'fallback\' })\n',
		expected: 'defer',
	},
	{
		name: 'runtime dynamic computed key is rejected by bounded evaluation',
		source: 'export const value = pika({ value: pika[dynamicKey] })\n',
		expected: 'reject',
	},
	{
		name: 'known non-string/number computed key is rejected by bounded evaluation',
		source: 'export const value = pika({ value: pika[null] })\n',
		expected: 'reject',
	},
	{
		name: 'bare root in a base argument is rejected',
		source: 'export const value = pika(pika)\n',
		expected: 'reject',
	},
	{
		name: 'standalone extension access is rejected',
		source: 'export const value = pika.theme.colors.primary\n',
		expected: 'reject',
	},
	{
		name: 'extension passed through another call is rejected',
		source: 'export const value = consume(pika.theme.colors.primary)\n',
		expected: 'reject',
	},
	{
		name: 'optional extension access is rejected',
		source: 'export const value = pika({ color: pika?.theme })\n',
		expected: 'reject',
	},
	{
		name: 'extension members are not callable',
		source: 'export const value = pika({ color: pika.theme() })\n',
		expected: 'reject',
	},
	{
		name: 'extension members cannot be constructed',
		source: 'export const value = pika({ color: new pika.theme() })\n',
		expected: 'reject',
	},
	{
		name: 'extension members cannot be tagged',
		source: 'export const value = pika({ color: pika.theme`value` })\n',
		expected: 'reject',
	},
	{
		name: 'extension members cannot be assignment targets',
		source: 'export const value = pika({ color: (pika.theme.value = \'red\') })\n',
		expected: 'reject',
	},
	{
		name: 'nested base call is rejected',
		source: 'export const value = pika({ color: pika({ color: \'red\' }) })\n',
		expected: 'reject',
	},
]
