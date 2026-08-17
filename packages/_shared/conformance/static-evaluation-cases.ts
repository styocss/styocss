/**
 * #119 — canonical static-evaluation semantics corpus.
 *
 * This file IS the specification: both production evaluators — the compiler
 * (`packages/integration/src/compiler/evaluate.ts`, Babel AST) and the ESLint
 * rule's evaluator (`packages/eslint-config/src/static-evaluate.ts`, ESTree)
 * — independently assert against these human-reviewed expected outcomes
 * through their REAL parser/production paths. Never assert one implementation
 * against the other, and never add a third reference evaluator.
 *
 * MAINTENANCE CONTRACT: any semantic change to the compiler's static subset
 * must update this corpus, the compiler, and the ESLint evaluator in the SAME
 * pull request.
 *
 * Success cases assert the EXACT evaluated value; rejection cases assert
 * semantic rejection only (error wording is each implementation's own
 * concern). Cases marked `dialect: 'ts'` use TypeScript-only syntax that the
 * espree-based ESLint conformance adapter cannot parse; they are classified
 * explicitly by that suite instead of silently skipped (the rule's own unit
 * tests cover the equivalent ESTree wrapper handling with synthetic nodes).
 *
 * Parser-unreachable semantics are deliberately NOT in the corpus:
 * - invalid template escapes in untagged templates are a SyntaxError in every
 *   supported parser (both sides pin their behavior via constructed nodes);
 * - Babel `PrivateName` binary operands cannot appear in a bare expression.
 * Call-boundary spread validation (`pika(...args)`) is macro-call semantics
 * owned by each side's call-site validation tests, not expression semantics.
 */

/* eslint-disable no-template-curly-in-string -- fixture sources are template-literal SOURCE TEXT, not templates */
export interface StaticEvaluationCase {
	name: string
	/** A single JavaScript/TypeScript expression. */
	source: string
	/** Present when the source needs TypeScript-only syntax. */
	dialect?: 'ts'
	/** Names evaluated as locally declared bindings (shadowing checks). */
	localBindings?: string[]
	expected:
		| { kind: 'value', value: unknown }
		| { kind: 'reject' }
}

export const STATIC_EVALUATION_CASES: Record<string, StaticEvaluationCase[]> = {
	'literals': [
		{ name: 'string literal', source: '\'red\'', expected: { kind: 'value', value: 'red' } },
		{ name: 'number literal', source: '42', expected: { kind: 'value', value: 42 } },
		{ name: 'float literal', source: '1.5', expected: { kind: 'value', value: 1.5 } },
		{ name: 'true literal', source: 'true', expected: { kind: 'value', value: true } },
		{ name: 'false literal', source: 'false', expected: { kind: 'value', value: false } },
		{ name: 'null literal', source: 'null', expected: { kind: 'value', value: null } },
	],
	'global constants': [
		{ name: 'undefined', source: 'undefined', expected: { kind: 'value', value: undefined } },
		{ name: 'NaN', source: 'NaN', expected: { kind: 'value', value: Number.NaN } },
		{ name: 'Infinity', source: 'Infinity', expected: { kind: 'value', value: Number.POSITIVE_INFINITY } },
		{ name: 'negated Infinity', source: '-Infinity', expected: { kind: 'value', value: Number.NEGATIVE_INFINITY } },
		{ name: 'shadowed NaN rejects', source: 'NaN', localBindings: ['NaN'], expected: { kind: 'reject' } },
		{ name: 'shadowed Infinity rejects', source: 'Infinity', localBindings: ['Infinity'], expected: { kind: 'reject' } },
		{ name: 'prototype members do not leak as globals', source: 'toString', expected: { kind: 'reject' } },
		{ name: 'hasOwnProperty does not leak as a global', source: 'hasOwnProperty', expected: { kind: 'reject' } },
	],
	'typescript wrappers': [
		{ name: 'as const', source: '1 as const', dialect: 'ts', expected: { kind: 'value', value: 1 } },
		{ name: 'as assertion', source: '\'x\' as string', dialect: 'ts', expected: { kind: 'value', value: 'x' } },
		{ name: 'satisfies', source: '2 satisfies number', dialect: 'ts', expected: { kind: 'value', value: 2 } },
		{ name: 'non-null assertion', source: '(\'y\')!', dialect: 'ts', expected: { kind: 'value', value: 'y' } },
		{ name: 'nested wrappers', source: '((3 as const))!', dialect: 'ts', expected: { kind: 'value', value: 3 } },
		{ name: 'parenthesized expression', source: '(\'z\')', expected: { kind: 'value', value: 'z' } },
		{ name: 'wrapped dynamic still rejects', source: '(dyn)!', dialect: 'ts', expected: { kind: 'reject' } },
	],
	'templates': [
		{ name: 'static template', source: '`a-b`', expected: { kind: 'value', value: 'a-b' } },
		{ name: 'template arithmetic', source: '`x-${1 + 2}`', expected: { kind: 'value', value: 'x-3' } },
		{ name: 'string interpolation', source: '`a${\'b\'}c`', expected: { kind: 'value', value: 'abc' } },
		{ name: 'boolean interpolation', source: '`v-${true}`', expected: { kind: 'value', value: 'v-true' } },
		{ name: 'null interpolation stringifies', source: '`v-${null}`', expected: { kind: 'value', value: 'v-null' } },
		{ name: 'undefined interpolation stringifies', source: '`v-${undefined}`', expected: { kind: 'value', value: 'v-undefined' } },
		{ name: 'array interpolation rejects', source: '`v-${[1]}`', expected: { kind: 'reject' } },
		{ name: 'object interpolation rejects', source: '`v-${({ a: 1 })}`', expected: { kind: 'reject' } },
		{ name: 'dynamic interpolation rejects', source: '`v-${dyn}`', expected: { kind: 'reject' } },
	],
	'unary operators': [
		{ name: 'negation', source: '-5', expected: { kind: 'value', value: -5 } },
		{ name: 'unary plus coerces', source: '+\'3\'', expected: { kind: 'value', value: 3 } },
		{ name: 'logical not', source: '!0', expected: { kind: 'value', value: true } },
		{ name: 'logical not on string', source: '!\'x\'', expected: { kind: 'value', value: false } },
		{ name: 'void', source: 'void \'anything\'', expected: { kind: 'value', value: undefined } },
		{ name: 'typeof rejects', source: 'typeof 1', expected: { kind: 'reject' } },
		{ name: 'bitwise not rejects', source: '~1', expected: { kind: 'reject' } },
		{ name: 'unary over dynamic rejects', source: '-dyn', expected: { kind: 'reject' } },
	],
	'binary operators': [
		{ name: 'number addition', source: '1 + 2', expected: { kind: 'value', value: 3 } },
		{ name: 'string concatenation', source: '\'a\' + \'b\'', expected: { kind: 'value', value: 'ab' } },
		{ name: 'mixed string/number addition', source: '\'a\' + 1', expected: { kind: 'value', value: 'a1' } },
		{ name: 'subtraction', source: '5 - 2', expected: { kind: 'value', value: 3 } },
		{ name: 'multiplication', source: '3 * 4', expected: { kind: 'value', value: 12 } },
		{ name: 'division', source: '10 / 4', expected: { kind: 'value', value: 2.5 } },
		{ name: 'strict equality', source: '1 === 1', expected: { kind: 'value', value: true } },
		{ name: 'strict inequality', source: '\'a\' !== \'b\'', expected: { kind: 'value', value: true } },
		{ name: 'plus with null operand rejects', source: '1 + null', expected: { kind: 'reject' } },
		{ name: 'plus with boolean operand rejects', source: 'true + 1', expected: { kind: 'reject' } },
		{ name: 'string concatenation absorbs a non-primitive operand', source: '\'a\' + []', expected: { kind: 'value', value: 'a' } },
		{ name: 'plus with number and array operands rejects', source: '1 + []', expected: { kind: 'reject' } },
		{ name: 'modulo rejects', source: '5 % 2', expected: { kind: 'reject' } },
		{ name: 'comparison rejects', source: '1 < 2', expected: { kind: 'reject' } },
		{ name: 'exponentiation rejects', source: '2 ** 3', expected: { kind: 'reject' } },
		{ name: 'loose equality rejects', source: '1 == 1', expected: { kind: 'reject' } },
	],
	'logical and conditional short-circuiting': [
		{ name: 'dead && branch may be dynamic', source: 'false && dyn()', expected: { kind: 'value', value: false } },
		{ name: 'taken && branch must be static', source: 'true && dyn()', expected: { kind: 'reject' } },
		{ name: '&& yields right value', source: 'true && \'x\'', expected: { kind: 'value', value: 'x' } },
		{ name: 'dead || branch may be dynamic', source: 'true || dyn()', expected: { kind: 'value', value: true } },
		{ name: 'truthy value short-circuits ||', source: '\'kept\' || dyn()', expected: { kind: 'value', value: 'kept' } },
		{ name: 'taken || branch must be static', source: 'false || dyn()', expected: { kind: 'reject' } },
		{ name: 'dead ?? branch may be dynamic', source: '0 ?? dyn()', expected: { kind: 'value', value: 0 } },
		{ name: '?? takes fallback on null', source: 'null ?? \'fb\'', expected: { kind: 'value', value: 'fb' } },
		{ name: 'taken ?? branch must be static', source: 'null ?? dyn()', expected: { kind: 'reject' } },
		{ name: 'conditional takes consequent only', source: 'true ? \'a\' : dyn()', expected: { kind: 'value', value: 'a' } },
		{ name: 'conditional takes alternate only', source: 'false ? dyn() : \'b\'', expected: { kind: 'value', value: 'b' } },
		{ name: 'dynamic condition rejects', source: 'dyn() ? 1 : 2', expected: { kind: 'reject' } },
		{ name: 'taken dynamic alternate rejects', source: 'false ? \'a\' : dyn()', expected: { kind: 'reject' } },
	],
	'arrays': [
		{ name: 'flat array', source: '[1, \'a\', true]', expected: { kind: 'value', value: [1, 'a', true] } },
		{ name: 'holes become undefined', source: '[1, , 2]', expected: { kind: 'value', value: [1, undefined, 2] } },
		{ name: 'nested arrays', source: '[[1], [2, [3]]]', expected: { kind: 'value', value: [[1], [2, [3]]] } },
		{ name: 'array spread of array', source: '[0, ...[1, 2]]', expected: { kind: 'value', value: [0, 1, 2] } },
		{ name: 'array spread of string rejects', source: '[...\'ab\']', expected: { kind: 'reject' } },
		{ name: 'array spread of object rejects', source: '[...({ a: 1 })]', expected: { kind: 'reject' } },
		{ name: 'array spread of dynamic rejects', source: '[...dyn()]', expected: { kind: 'reject' } },
		{ name: 'dynamic element rejects', source: '[1, dyn()]', expected: { kind: 'reject' } },
	],
	'objects': [
		{ name: 'flat object', source: '({ a: 1, b: \'x\' })', expected: { kind: 'value', value: { a: 1, b: 'x' } } },
		{ name: 'nested object', source: '({ a: { b: [1] } })', expected: { kind: 'value', value: { a: { b: [1] } } } },
		{ name: 'string literal key', source: '({ \'k-1\': 1 })', expected: { kind: 'value', value: { 'k-1': 1 } } },
		{ name: 'numeric literal key', source: '({ 2: \'v\' })', expected: { kind: 'value', value: { 2: 'v' } } },
		{ name: 'computed string key', source: '({ [\'k\']: 1 })', expected: { kind: 'value', value: { k: 1 } } },
		{ name: 'computed template key', source: '({ [`k-${1}`]: 1 })', expected: { kind: 'value', value: { 'k-1': 1 } } },
		{ name: 'computed number key', source: '({ [3]: \'v\' })', expected: { kind: 'value', value: { 3: 'v' } } },
		{ name: 'computed null key rejects', source: '({ [null]: 1 })', expected: { kind: 'reject' } },
		{ name: 'computed array key rejects', source: '({ [[]]: 1 })', expected: { kind: 'reject' } },
		{ name: 'object spread of object', source: '({ ...{ a: 1 }, b: 2 })', expected: { kind: 'value', value: { a: 1, b: 2 } } },
		{ name: 'object spread of array rejects', source: '({ ...[1] })', expected: { kind: 'reject' } },
		{ name: 'object spread of null rejects', source: '({ ...null })', expected: { kind: 'reject' } },
		{ name: 'object method rejects', source: '({ m() {} })', expected: { kind: 'reject' } },
		{ name: 'object getter rejects', source: '({ get x() { return 1 } })', expected: { kind: 'reject' } },
		{ name: 'shorthand dynamic property rejects', source: '({ dyn })', expected: { kind: 'reject' } },
	],
	'unsupported expressions': [
		{ name: 'regex literal rejects', source: '/re/', expected: { kind: 'reject' } },
		{ name: 'bigint literal rejects', source: '10n', expected: { kind: 'reject' } },
		{ name: 'free identifier rejects', source: 'foo', expected: { kind: 'reject' } },
		{ name: 'call expression rejects', source: 'foo()', expected: { kind: 'reject' } },
		{ name: 'member expression rejects', source: 'obj.prop', expected: { kind: 'reject' } },
		{ name: 'arrow function rejects', source: '() => 1', expected: { kind: 'reject' } },
		{ name: 'sequence expression rejects', source: '(1, 2)', expected: { kind: 'reject' } },
	],
}

/** Flattened view for `it.each`-style consumption. */
export const ALL_STATIC_EVALUATION_CASES: (StaticEvaluationCase & { category: string })[]
	= Object.entries(STATIC_EVALUATION_CASES)
		.flatMap(([category, cases]) => cases.map(item => ({ category, ...item })))
