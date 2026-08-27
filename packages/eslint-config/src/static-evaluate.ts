import type { Scope } from 'eslint'

/**
 * The production static-expression evaluator behind the `static-usage`
 * rule, extracted so the rule and the shared conformance suite consume the
 * SAME implementation (#119). It evaluates typescript-eslint/espree ESTree
 * nodes against the exact semantic subset the build-time compiler supports.
 *
 * MAINTENANCE CONTRACT (#119): any semantic change to the compiler's static
 * expression subset (`packages/integration/src/compiler/evaluate.ts`) must,
 * in the SAME pull request, update this evaluator AND the canonical corpus in
 * `packages/_shared/conformance/`. A compiler-only semantic expansion is
 * incomplete until both land together.
 */

// Global constant identifiers the compiler evaluates statically (only when
// they are NOT shadowed by a real local binding). Mirrors GLOBAL_CONSTANTS in
// `@pikacss/integration`'s compiler evaluator.
const GLOBAL_CONSTANT_VALUES = new Map<string, unknown>([
	['undefined', undefined],
	['NaN', Number.NaN],
	['Infinity', Number.POSITIVE_INFINITY],
])

// Wrapper node types the compiler's evaluator unwraps before evaluating.
// Mirrors `unwrap` in `@pikacss/integration`'s `evaluate.ts` (Babel names the
// same wrappers identically in the typescript-eslint ESTree flavor).
const WRAPPER_NODE_TYPES = new Set([
	'TSNonNullExpression',
	'TSAsExpression',
	'TSSatisfiesExpression',
	'TSTypeAssertion',
	'TSInstantiationExpression',
	'ParenthesizedExpression',
])

export function unwrap(node: any): any {
	let current = node
	while (current != null && WRAPPER_NODE_TYPES.has(current.type))
		current = current.expression
	return current
}

/**
 * Whether `name` is shadowed by a binding with an actual declaration site
 * (import, variable, parameter, function/class declaration). Used for both
 * global-constant shadowing and callee-root shadowing.
 *
 * ESLint's global scope contains ambient variables with zero `defs`:
 * `undefined`/`NaN`/`Infinity` always, plus anything the user configures via
 * `languageOptions.globals` (e.g. `{ pika: 'readonly' }` to silence
 * `no-undef`). The compiler resolves shadowing via Babel's
 * `path.scope.getBinding`, which returns nothing for ambient/configured
 * globals — so only variables with real declarations
 * (`variable.defs.length > 0`) count as shadowing here.
 */
export function isShadowedByDeclaration(name: string, scope: Scope.Scope | null | undefined): boolean {
	for (let current = scope; current != null; current = current.upper) {
		const variable = current.variables.find(v => v.name === name)
		if (variable != null && variable.defs != null && variable.defs.length > 0)
			return true
	}
	return false
}

/** A fully known evaluator result. */
export interface EvalSuccess {
	readonly kind: 'known'
	/** Kept for compatibility with the previous binary evaluator result. */
	readonly ok: true
	readonly value: unknown
}

/** A legal static source whose value depends on Engine/plugin state. */
export interface EvalEngineDependent {
	readonly kind: 'engine-dependent'
	/** `false` means the result is not a known value, not that syntax is invalid. */
	readonly ok: false
	readonly node: any
	readonly reason: string
}

/** A source form that is provably outside the bounded static subset. */
export interface EvalFailure {
	readonly kind: 'invalid'
	readonly ok: false
	readonly node: any
	readonly reason: string
}

export type EvalResult = EvalSuccess | EvalEngineDependent | EvalFailure

function known(value: unknown): EvalSuccess {
	return { kind: 'known', ok: true, value }
}

function dependent(node: any, reason = 'Value depends on a Pika static extension evaluated during compiler prepare'): EvalEngineDependent {
	return { kind: 'engine-dependent', ok: false, node, reason }
}

function fail(node: any, reason?: string): EvalFailure {
	return { kind: 'invalid', ok: false, node, reason: reason ?? getDynamicReason(node) }
}

// Failure produced when a child node is missing (malformed/synthetic ASTs).
// Callers substitute the containing node via `orParent`.
const MISSING_CHILD: EvalFailure = { kind: 'invalid', ok: false, node: null, reason: '' }

function orParent(failure: EvalFailure, parent: any): EvalFailure {
	return failure.node == null ? fail(parent) : failure
}

function orParentResult(result: EvalResult, parent: any): EvalResult {
	return result.kind === 'invalid' ? orParent(result, parent) : result
}

function evaluateTemplateLiteral(node: any, scope: Scope.Scope | null | undefined, fnName: string): EvalResult {
	let result = ''
	let dependency: EvalEngineDependent | undefined
	for (let index = 0; index < (node.quasis ?? []).length; index++) {
		const cooked = node.quasis[index]?.value?.cooked
		if (cooked == null)
			return fail(node, 'Template literal contains an invalid escape sequence')
		result += cooked
		if (index < (node.expressions ?? []).length) {
			const expression = node.expressions[index]
			const value = evaluateStatic(expression, scope, fnName)
			if (value.kind === 'invalid')
				return orParent(value, node)
			if (value.kind === 'engine-dependent') {
				dependency ??= value
				continue
			}
			// The compiler rejects non-primitive interpolations but allows
			// null/undefined (stringified like runtime template literals).
			if (value.value != null && typeof value.value !== 'string' && typeof value.value !== 'number' && typeof value.value !== 'boolean')
				return fail(expression, 'Template expression evaluates to a non-primitive value, which fails the build-time evaluation')
			result += String(value.value)
		}
	}
	return dependency ?? known(result)
}

function evaluateUnary(node: any, scope: Scope.Scope | null | undefined, fnName: string): EvalResult {
	const argument = evaluateStatic(node.argument, scope, fnName)
	if (argument.kind === 'invalid')
		return orParent(argument, node)
	if (argument.kind === 'engine-dependent')
		return dependent(node)
	switch (node.operator) {
		case '-':
			return known(-(argument.value as number))
		case '+':
			return known(+(argument.value as number))
		case '!':
			return known(!argument.value)
		case 'void':
			return known(undefined)
		default:
			return fail(node)
	}
}

function evaluateBinary(node: any, scope: Scope.Scope | null | undefined, fnName: string): EvalResult {
	const left = evaluateStatic(node.left, scope, fnName)
	if (left.kind === 'invalid')
		return orParent(left, node)
	const right = evaluateStatic(node.right, scope, fnName)
	if (right.kind === 'invalid')
		return orParent(right, node)
	if (left.kind === 'engine-dependent' || right.kind === 'engine-dependent')
		return dependent(node)

	const l = left.value
	const r = right.value
	switch (node.operator) {
		case '+':
			if (typeof l === 'string' || typeof r === 'string')
				return known(`${l}${r}`)
			if (typeof l === 'number' && typeof r === 'number')
				return known(l + r)
			// Mirrors the compiler's hard error: '+' on non-string/non-number operands.
			return fail(node, `'+' on operands that are neither strings nor two numbers fails the build-time evaluation`)
		case '-':
			return known((l as number) - (r as number))
		case '*':
			return known((l as number) * (r as number))
		case '/':
			return known((l as number) / (r as number))
		case '===':
			return known(l === r)
		case '!==':
			return known(l !== r)
		default:
			return fail(node)
	}
}

function evaluateLogical(node: any, scope: Scope.Scope | null | undefined, fnName: string): EvalResult {
	const left = evaluateStatic(node.left, scope, fnName)
	if (left.kind === 'invalid')
		return orParent(left, node)
	// An Engine-dependent left operand controls reachability. A violation in
	// the right operand is therefore not provable without executing the
	// extension, so the compiler remains authoritative for this expression.
	if (left.kind === 'engine-dependent')
		return dependent(node)

	switch (node.operator) {
		case '&&':
			return left.value ? orParentResult(evaluateStatic(node.right, scope, fnName), node) : left
		case '||':
			return left.value ? left : orParentResult(evaluateStatic(node.right, scope, fnName), node)
		case '??':
			return left.value != null ? left : orParentResult(evaluateStatic(node.right, scope, fnName), node)
		default:
			return fail(node)
	}
}

function evaluateArray(node: any, scope: Scope.Scope | null | undefined, fnName: string): EvalResult {
	const result: unknown[] = []
	let dependency: EvalEngineDependent | undefined
	for (const element of node.elements ?? []) {
		if (element == null) {
			// Sparse arrays: holes evaluate to undefined, like the compiler.
			result.push(undefined)
			continue
		}
		if (element.type === 'SpreadElement') {
			const spread = evaluateStatic(element.argument, scope, fnName)
			if (spread.kind === 'invalid')
				return orParent(spread, element)
			if (spread.kind === 'engine-dependent') {
				dependency ??= spread
				continue
			}
			if (!Array.isArray(spread.value))
				return fail(element, 'Array spread of a non-array value fails the build-time evaluation')
			result.push(...spread.value)
			continue
		}
		const value = evaluateStatic(element, scope, fnName)
		if (value.kind === 'invalid')
			return orParent(value, element)
		if (value.kind === 'engine-dependent') {
			dependency ??= value
			continue
		}
		result.push(value.value)
	}
	return dependency ?? known(result)
}

export interface ObjectKeyKnown extends EvalSuccess {
	readonly key: string
}

export type ObjectKeyResult = ObjectKeyKnown | EvalEngineDependent | EvalFailure

export function evaluateObjectKey(property: any, scope: Scope.Scope | null | undefined, fnName = 'pika'): ObjectKeyResult {
	if (property?.computed) {
		const key = evaluateStatic(property.key, scope, fnName)
		if (key.kind === 'invalid')
			return orParent(key, property)
		if (key.kind === 'engine-dependent')
			return dependent(property.key)
		if (typeof key.value !== 'string' && typeof key.value !== 'number')
			return fail(property.key, 'Computed object key does not evaluate to a string or number')
		return { kind: 'known', ok: true, value: String(key.value), key: String(key.value) }
	}
	const key = property?.key
	if (key?.type === 'Identifier')
		return { kind: 'known', ok: true, value: key.name, key: key.name }
	if (key?.type === 'Literal' && typeof key.value === 'string')
		return { kind: 'known', ok: true, value: key.value, key: key.value }
	if (key?.type === 'Literal' && typeof key.value === 'number')
		return { kind: 'known', ok: true, value: String(key.value), key: String(key.value) }
	return fail(key ?? property, 'Object keys must be identifiers, string literals, or number literals')
}

function evaluateObject(node: any, scope: Scope.Scope | null | undefined, fnName: string): EvalResult {
	const result: Record<string, unknown> = {}
	let dependency: EvalEngineDependent | undefined
	for (const property of node.properties ?? []) {
		if (property.type === 'SpreadElement') {
			const spread = evaluateStatic(property.argument, scope, fnName)
			if (spread.kind === 'invalid')
				return orParent(spread, property)
			if (spread.kind === 'engine-dependent') {
				dependency ??= spread
				continue
			}
			if (spread.value == null || typeof spread.value !== 'object' || Array.isArray(spread.value))
				return fail(property, 'Object spread of a non-object value fails the build-time evaluation')
			Object.assign(result, spread.value)
			continue
		}
		if (property.type !== 'Property')
			return fail(property)
		const key = evaluateObjectKey(property, scope, fnName)
		if (key.kind === 'invalid')
			return key
		if (key.kind === 'engine-dependent')
			dependency ??= key
		const value = evaluateStatic(property.value, scope, fnName)
		if (value.kind === 'invalid')
			return orParent(value, property)
		if (value.kind === 'engine-dependent') {
			dependency ??= value
			continue
		}
		if (key.kind === 'known')
			result[key.key] = value.value
	}
	return dependency ?? known(result)
}

function evaluateConditional(node: any, scope: Scope.Scope | null | undefined, fnName: string): EvalResult {
	const test = evaluateStatic(node.test, scope, fnName)
	if (test.kind === 'invalid')
		return orParent(test, node)
	if (test.kind === 'known')
		return orParentResult(evaluateStatic(test.value ? node.consequent : node.alternate, scope, fnName), node)

	// The condition is Engine-dependent, so either branch may be reached. A
	// branch failure is reportable only if both possible branches fail without
	// depending on the extension value; otherwise prepare remains authoritative.
	const consequent = evaluateStatic(node.consequent, scope, fnName)
	const alternate = evaluateStatic(node.alternate, scope, fnName)
	if (consequent.kind === 'invalid' && alternate.kind === 'invalid')
		return consequent
	return dependent(node)
}

function evaluateMemberKey(node: any, scope: Scope.Scope | null | undefined, fnName: string): EvalResult {
	if (!node.computed) {
		if (node.property?.type !== 'Identifier')
			return fail(node.property ?? node, 'Static-extension dot access requires an identifier property')
		return known(node.property.name)
	}
	if (node.property?.type === 'PrivateIdentifier' || node.property?.type === 'PrivateName')
		return fail(node.property, 'Private static-extension members are not supported')
	const key = evaluateStatic(node.property, scope, fnName)
	if (key.kind !== 'known')
		return key
	if (typeof key.value !== 'string' && typeof key.value !== 'number')
		return fail(node.property, 'Static-extension computed member keys must be statically evaluable strings or numbers')
	return key
}

interface StaticExtensionPath {
	readonly root: string
}

function collectStaticExtensionPath(
	node: AnyNode,
	fnName: string,
	scope: Scope.Scope | null | undefined,
): StaticExtensionPath | EvalFailure | null {
	let current: any = node
	while (true) {
		const target = unwrap(current)
		if (target?.type !== 'MemberExpression') {
			if (target?.type !== 'Identifier' || target.name !== fnName || isShadowedByDeclaration(target.name, scope))
				return null
			break
		}
		const key = evaluateMemberKey(target, scope, fnName)
		if (key.kind === 'invalid')
			return key
		current = target.object
	}
	return { root: fnName }
}

type AnyNode = Record<string, any> & { type: string }

function evaluateStaticExtension(node: AnyNode, fnName: string, scope: Scope.Scope | null | undefined): EvalResult {
	const path = collectStaticExtensionPath(node, fnName, scope)
	if (path == null)
		return fail(node, 'Member expressions are not statically analyzable')
	if ('kind' in path)
		return path
	return dependent(node)
}

/**
 * Statically evaluate an ESTree expression node the same way the compiler's
 * build-time evaluator (`evaluateStatic` in `@pikacss/integration`) does.
 *
 * The result has three states:
 *
 * - `known(value)` is fully determined from source and lexical scope;
 * - `engine-dependent` is a structurally legal direct static-extension chain
 *   (or an expression that depends on one), whose terminal value ESLint must
 *   not execute or guess;
 * - `invalid` is provably outside the compiler's bounded static subset.
 *
 * Known-only cases retain value-aware short-circuit/type/shape precision.
 * When an Engine-dependent value controls reachability, diagnostics are
 * intentionally deferred to compiler prepare rather than narrowed by ESLint.
 */
export function evaluateStatic(node: any, scope: Scope.Scope | null | undefined, fnName = 'pika'): EvalResult {
	if (node == null)
		return MISSING_CHILD
	const target = unwrap(node)
	if (target == null)
		return MISSING_CHILD
	switch (target.type) {
		case 'Literal':
			// Regex and BigInt literals are Babel RegExpLiteral/BigIntLiteral
			// nodes, which the compiler rejects as unsupported expressions.
			if (target.regex != null)
				return fail(target, 'Regular expression literals are not statically analyzable')
			if (target.bigint != null)
				return fail(target, 'BigInt literals are not statically analyzable')
			return known(target.value)

		case 'Identifier':
			// undefined / NaN / Infinity evaluate to their global values unless
			// shadowed by a binding with a real declaration.
			if (GLOBAL_CONSTANT_VALUES.has(target.name) && !isShadowedByDeclaration(target.name, scope))
				return known(GLOBAL_CONSTANT_VALUES.get(target.name))
			return fail(target)

		case 'TemplateLiteral':
			return evaluateTemplateLiteral(target, scope, fnName)

		case 'UnaryExpression':
			return evaluateUnary(target, scope, fnName)

		case 'BinaryExpression':
			return evaluateBinary(target, scope, fnName)

		case 'LogicalExpression':
			return evaluateLogical(target, scope, fnName)

		case 'ConditionalExpression':
			return evaluateConditional(target, scope, fnName)

		case 'ArrayExpression':
			return evaluateArray(target, scope, fnName)

		case 'ObjectExpression':
			return evaluateObject(target, scope, fnName)

		case 'MemberExpression':
			return evaluateStaticExtension(target, fnName, scope)

		case 'OptionalMemberExpression':
			return fail(target, 'Optional static-extension member access is not supported')

		default:
			return fail(target)
	}
}

/**
 * Get a human-readable description of why a node is not static.
 */
export function getDynamicReason(node: any): string {
	if (node == null)
		return 'This expression is not statically analyzable'
	switch (node.type) {
		case 'Identifier':
			return `Variable reference '${node.name}' is not statically analyzable`
		case 'CallExpression':
			return 'Function calls are not statically analyzable'
		case 'TemplateLiteral':
			return 'Template literals with expressions are not statically analyzable'
		case 'ConditionalExpression':
			return 'Conditional expressions are not statically analyzable'
		case 'UnaryExpression':
		case 'BinaryExpression':
		case 'LogicalExpression':
			return `'${node.operator}' expressions are not statically analyzable`
		case 'MemberExpression':
		case 'OptionalMemberExpression':
			return 'Member expressions are not statically analyzable'
		case 'TaggedTemplateExpression':
			return 'Tagged template expressions are not statically analyzable'
		case 'NewExpression':
			return 'New expressions are not statically analyzable'
		case 'AwaitExpression':
			return 'Await expressions are not statically analyzable'
		case 'YieldExpression':
			return 'Yield expressions are not statically analyzable'
		case 'AssignmentExpression':
			return 'Assignment expressions are not statically analyzable'
		case 'SequenceExpression':
			return 'Sequence expressions are not statically analyzable'
		default:
			return 'This expression is not statically analyzable'
	}
}
