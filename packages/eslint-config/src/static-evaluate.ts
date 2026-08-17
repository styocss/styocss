import type { Scope } from 'eslint'

/**
 * The production static-expression evaluator behind the `no-dynamic-args`
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
	for (let s = scope; s != null; s = s.upper) {
		const variable = s.variables.find(v => v.name === name)
		if (variable != null && variable.defs != null && variable.defs.length > 0)
			return true
	}
	return false
}

export interface EvalSuccess { ok: true, value: unknown }
export interface EvalFailure { ok: false, node: any, reason: string }
export type EvalResult = EvalSuccess | EvalFailure

function ok(value: unknown): EvalSuccess {
	return { ok: true, value }
}

function fail(node: any, reason?: string): EvalFailure {
	return { ok: false, node, reason: reason ?? getDynamicReason(node) }
}

// Failure produced when a child node is missing (malformed/synthetic ASTs).
// Callers substitute the containing node via `orParent`.
const MISSING_CHILD: EvalFailure = { ok: false, node: null, reason: '' }

function orParent(failure: EvalFailure, parent: any): EvalFailure {
	return failure.node == null ? fail(parent) : failure
}

function evaluateTemplateLiteral(node: any, scope: Scope.Scope | null | undefined): EvalResult {
	let result = ''
	for (let index = 0; index < node.quasis.length; index++) {
		const cooked = node.quasis[index]?.value?.cooked
		if (cooked == null)
			return fail(node, 'Template literal contains an invalid escape sequence')
		result += cooked
		if (index < node.expressions.length) {
			const expression = node.expressions[index]
			const value = evaluateStatic(expression, scope)
			if (!value.ok)
				return orParent(value, node)
			// The compiler rejects non-primitive interpolations but allows
			// null/undefined (stringified like runtime template literals).
			if (value.value != null && typeof value.value !== 'string' && typeof value.value !== 'number' && typeof value.value !== 'boolean')
				return fail(expression, 'Template expression evaluates to a non-primitive value, which fails the build-time evaluation')
			result += String(value.value)
		}
	}
	return ok(result)
}

function evaluateUnary(node: any, scope: Scope.Scope | null | undefined): EvalResult {
	const argument = evaluateStatic(node.argument, scope)
	if (!argument.ok)
		return orParent(argument, node)
	switch (node.operator) {
		case '-':
			return ok(-(argument.value as number))
		case '+':
			return ok(+(argument.value as number))
		case '!':
			return ok(!argument.value)
		case 'void':
			return ok(undefined)
		default:
			return fail(node)
	}
}

function evaluateBinary(node: any, scope: Scope.Scope | null | undefined): EvalResult {
	const left = evaluateStatic(node.left, scope)
	if (!left.ok)
		return orParent(left, node)
	const right = evaluateStatic(node.right, scope)
	if (!right.ok)
		return orParent(right, node)
	const l = left.value
	const r = right.value
	switch (node.operator) {
		case '+':
			if (typeof l === 'string' || typeof r === 'string')
				return ok(`${l}${r}`)
			if (typeof l === 'number' && typeof r === 'number')
				return ok(l + r)
			// Mirrors the compiler's hard error: '"+" on non-string/non-number operands'.
			return fail(node, '\'+\' on operands that are neither strings nor two numbers fails the build-time evaluation')
		case '-':
			return ok((l as number) - (r as number))
		case '*':
			return ok((l as number) * (r as number))
		case '/':
			return ok((l as number) / (r as number))
		case '===':
			return ok(l === r)
		case '!==':
			return ok(l !== r)
		default:
			return fail(node)
	}
}

function evaluateLogical(node: any, scope: Scope.Scope | null | undefined): EvalResult {
	const left = evaluateStatic(node.left, scope)
	if (!left.ok)
		return orParent(left, node)
	// Mirror the compiler's short-circuit: the right operand is evaluated only
	// when the left value does not decide the result.
	switch (node.operator) {
		case '&&':
			return left.value ? orParentResult(evaluateStatic(node.right, scope), node) : left
		case '||':
			return left.value ? left : orParentResult(evaluateStatic(node.right, scope), node)
		case '??':
			return left.value != null ? left : orParentResult(evaluateStatic(node.right, scope), node)
		default:
			return fail(node)
	}
}

function orParentResult(result: EvalResult, parent: any): EvalResult {
	return result.ok ? result : orParent(result, parent)
}

function evaluateArray(node: any, scope: Scope.Scope | null | undefined): EvalResult {
	const result: unknown[] = []
	for (const element of node.elements) {
		if (element == null) {
			// Sparse arrays: holes evaluate to undefined, like the compiler.
			result.push(undefined)
			continue
		}
		if (element.type === 'SpreadElement') {
			const spread = evaluateStatic(element.argument, scope)
			if (!spread.ok)
				return orParent(spread, element)
			if (!Array.isArray(spread.value))
				return fail(element, 'Array spread of a non-array value fails the build-time evaluation')
			result.push(...spread.value)
			continue
		}
		const value = evaluateStatic(element, scope)
		if (!value.ok)
			return orParent(value, element)
		result.push(value.value)
	}
	return ok(result)
}

export function evaluateObjectKey(property: any, scope: Scope.Scope | null | undefined): { ok: true, key: string } | EvalFailure {
	if (property.computed) {
		const key = evaluateStatic(property.key, scope)
		if (!key.ok)
			return orParent(key, property)
		if (typeof key.value !== 'string' && typeof key.value !== 'number')
			return fail(property.key, 'Computed object key does not evaluate to a string or number')
		return { ok: true, key: String(key.value) }
	}
	const key = property.key
	if (key?.type === 'Identifier')
		return { ok: true, key: key.name }
	if (key?.type === 'Literal' && typeof key.value === 'string')
		return { ok: true, key: key.value }
	if (key?.type === 'Literal' && typeof key.value === 'number')
		return { ok: true, key: String(key.value) }
	return fail(key ?? property, 'Object keys must be identifiers, string literals, or number literals')
}

function evaluateObject(node: any, scope: Scope.Scope | null | undefined): EvalResult {
	const result: Record<string, unknown> = {}
	for (const property of node.properties) {
		if (property.type === 'SpreadElement') {
			const spread = evaluateStatic(property.argument, scope)
			if (!spread.ok)
				return orParent(spread, property)
			if (spread.value == null || typeof spread.value !== 'object' || Array.isArray(spread.value))
				return fail(property, 'Object spread of a non-object value fails the build-time evaluation')
			Object.assign(result, spread.value)
			continue
		}
		if (property.type !== 'Property')
			return fail(property)
		const key = evaluateObjectKey(property, scope)
		if (!key.ok)
			return key
		const value = evaluateStatic(property.value, scope)
		if (!value.ok)
			return orParent(value, property)
		result[key.key] = value.value
	}
	return ok(result)
}

/**
 * Statically evaluate an ESTree expression node the same way the compiler's
 * build-time evaluator (`evaluateStatic` in `@pikacss/integration`) does.
 *
 * Value-aware on purpose: the compiler short-circuits logical expressions,
 * evaluates only the taken conditional branch, and hard-errors on
 * type-invalid static forms (`'+'` on non-string/non-number operands,
 * template interpolation of a non-primitive, spread of a wrong-shaped value,
 * computed keys that are not strings/numbers). Node-shape checks alone cannot
 * reproduce those semantics.
 *
 * Returns either the evaluated value or the first failing node with a
 * human-readable reason — mirroring the compiler, which throws at the first
 * failure.
 */
export function evaluateStatic(node: any, scope: Scope.Scope | null | undefined): EvalResult {
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
			return ok(target.value)

		case 'Identifier':
			// undefined / NaN / Infinity evaluate to their global values unless
			// shadowed by a binding with a real declaration site.
			if (GLOBAL_CONSTANT_VALUES.has(target.name) && !isShadowedByDeclaration(target.name, scope))
				return ok(GLOBAL_CONSTANT_VALUES.get(target.name))
			return fail(target)

		case 'TemplateLiteral':
			return evaluateTemplateLiteral(target, scope)

		case 'UnaryExpression':
			return evaluateUnary(target, scope)

		case 'BinaryExpression':
			return evaluateBinary(target, scope)

		case 'LogicalExpression':
			return evaluateLogical(target, scope)

		case 'ConditionalExpression': {
			const test = evaluateStatic(target.test, scope)
			if (!test.ok)
				return orParent(test, target)
			// Only the taken branch must be static, like the compiler.
			return orParentResult(evaluateStatic(test.value ? target.consequent : target.alternate, scope), target)
		}

		case 'ArrayExpression':
			return evaluateArray(target, scope)

		case 'ObjectExpression':
			return evaluateObject(target, scope)

		default:
			return fail(target)
	}
}

/**
 * Get a human-readable description of why a node is not static.
 */
export function getDynamicReason(node: any): string {
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
