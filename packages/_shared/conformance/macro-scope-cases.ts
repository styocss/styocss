/**
 * #119 — canonical macro-detection / scope semantics corpus.
 *
 * Each case is a complete module containing exactly one `pika`-looking call
 * whose argument is deliberately DYNAMIC (`dyn`): an implementation that
 * inspects the call must flag/reject it, and one that ignores the call must
 * not. That observable difference is how both production paths — the
 * compiler's Babel collector/scope lookup and the ESLint rule's scope
 * analysis — are asserted against the same expected outcome without encoding
 * either AST representation.
 *
 * MAINTENANCE CONTRACT: shared with `static-evaluation-cases.ts` — semantic
 * changes to macro/scope behavior update this corpus, the compiler, and the
 * ESLint rule in the SAME pull request.
 */

export interface MacroScopeCase {
	name: string
	/** Complete module source with exactly one `pika`-looking call taking `dyn`. */
	source: string
	/** Present when the source needs TypeScript-only syntax. */
	dialect?: 'ts'
	/**
	 * Ambient ESLint globals to configure (`languageOptions.globals`).
	 * Configured-but-undeclared globals must NOT count as shadowing: the
	 * compiler would still transform the call.
	 */
	eslintGlobals?: Record<string, 'readonly'>
	expected: 'inspect' | 'ignore'
}

export const MACRO_SCOPE_CASES: MacroScopeCase[] = [
	{
		name: 'bare global macro call',
		source: 'export const a = pika(dyn)\n',
		expected: 'inspect',
	},
	{
		name: 'member variant call',
		source: 'export const a = pika.str(dyn)\n',
		expected: 'inspect',
	},
	{
		name: 'bracket member variant call',
		source: 'export const a = pika[\'arr\'](dyn)\n',
		expected: 'inspect',
	},
	{
		name: 'imported binding is ignored',
		source: 'import { pika } from \'./somewhere\'\nexport const a = pika(dyn)\n',
		expected: 'ignore',
	},
	{
		name: 'local const binding is ignored',
		source: 'const pika = (v) => v\nexport const a = pika(dyn)\n',
		expected: 'ignore',
	},
	{
		name: 'function parameter binding is ignored',
		source: 'export function wrap(pika) {\n\treturn pika(dyn)\n}\n',
		expected: 'ignore',
	},
	{
		name: 'function declaration shadowing is ignored',
		source: 'function pika(v) { return v }\nexport const a = pika(dyn)\n',
		expected: 'ignore',
	},
	{
		name: 'class declaration shadowing is ignored',
		source: 'class pika {}\nexport const a = pika(dyn)\n',
		expected: 'ignore',
	},
	{
		name: 'shadowing is scoped to its subtree',
		source: 'export function inner(pika) { return pika(dyn) }\n',
		expected: 'ignore',
	},
	{
		name: 'outer usage next to an inner shadow is inspected',
		source: 'export function inner(other) { return other }\nexport const a = pika(dyn)\n',
		expected: 'inspect',
	},
	{
		name: 'configured ambient global without a declaration is still inspected',
		source: 'export const a = pika(dyn)\n',
		eslintGlobals: { pika: 'readonly' },
		expected: 'inspect',
	},
	{
		name: 'optional call is ignored',
		source: 'export const a = pika?.(dyn)\n',
		expected: 'ignore',
	},
	{
		name: 'optional member call is ignored',
		source: 'export const a = pika?.str(dyn)\n',
		expected: 'ignore',
	},
	{
		name: 'optional member invocation is ignored',
		source: 'export const a = pika.str?.(dyn)\n',
		expected: 'ignore',
	},
	{
		name: 'type-instantiated macro call is inspected',
		source: 'export const a = pika<string>(dyn)\n',
		dialect: 'ts',
		expected: 'inspect',
	},
	{
		name: 'instantiation-wrapped callee is inspected',
		source: 'export const a = (pika<string>)(dyn)\n',
		dialect: 'ts',
		expected: 'inspect',
	},
	{
		name: 'member call on a non-variant property is ignored',
		source: 'export const a = pika.other(dyn)\n',
		expected: 'ignore',
	},
]
