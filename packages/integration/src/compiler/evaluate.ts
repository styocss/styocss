import type * as t from '@babel/types'
import { nodeLoc, PikaTransformError } from './errors'

/**
 * Context for statically evaluating a macro-call argument.
 */
export interface EvaluateContext {
	/** Normalized absolute path of the module, used in error messages. */
	id: string
	/**
	 * Returns whether the given name resolves to a local binding at the call
	 * site. Global constants (`undefined`, `NaN`, `Infinity`) are only
	 * evaluable when unshadowed.
	 */
	hasLocalBinding: (name: string) => boolean
}

// MAINTENANCE CONTRACT (#119): this evaluator's semantic subset is specified
// by the canonical corpus in `packages/_shared/conformance/`. Any semantic
// change here must, in the SAME pull request, update that corpus AND the
// ESLint evaluator (`packages/eslint-config/src/static-evaluate.ts`). A
// compiler-only semantic expansion is incomplete until both land together.
const GLOBAL_CONSTANTS: Record<string, unknown> = {
	undefined,
	NaN: Number.NaN,
	Infinity: Number.POSITIVE_INFINITY,
}

function fail(node: t.Node, ctx: EvaluateContext, reason: string): never {
	throw new PikaTransformError({
		id: ctx.id,
		stage: 'evaluate',
		loc: nodeLoc(node),
		message: `Failed to statically evaluate pika() argument: ${reason}. `
			+ 'Arguments must be statically analyzable (literals, objects, arrays, static template strings, and simple static operators).',
	})
}

function unwrap(node: t.Node): t.Node {
	let current = node
	while (
		current.type === 'TSNonNullExpression'
		|| current.type === 'TSAsExpression'
		|| current.type === 'TSSatisfiesExpression'
		|| current.type === 'TSTypeAssertion'
		|| current.type === 'TSInstantiationExpression'
		|| current.type === 'ParenthesizedExpression'
	) {
		current = current.expression
	}
	return current
}

function evaluateObject(node: t.ObjectExpression, ctx: EvaluateContext): Record<string, unknown> {
	const result: Record<string, unknown> = {}
	for (const property of node.properties) {
		if (property.type === 'SpreadElement') {
			const spread = evaluateStatic(property.argument, ctx)
			if (spread == null || typeof spread !== 'object' || Array.isArray(spread)) {
				fail(property, ctx, 'object spread of a non-object value')
			}
			Object.assign(result, spread)
			continue
		}
		if (property.type === 'ObjectMethod') {
			fail(property, ctx, 'object methods are not supported')
		}
		result[evaluateObjectKey(property, ctx)] = evaluateStatic(property.value, ctx)
	}
	return result
}

function evaluateObjectKey(property: t.ObjectProperty, ctx: EvaluateContext): string {
	if (property.computed) {
		const key = evaluateStatic(property.key, ctx)
		if (typeof key !== 'string' && typeof key !== 'number') {
			fail(property.key, ctx, 'computed object key does not evaluate to a string or number')
		}
		return String(key)
	}
	const key = property.key
	if (key.type === 'Identifier') {
		return key.name
	}
	if (key.type === 'StringLiteral') {
		return key.value
	}
	if (key.type === 'NumericLiteral') {
		return String(key.value)
	}
	return fail(key, ctx, `unsupported object key of type ${key.type}`)
}

function evaluateArray(node: t.ArrayExpression, ctx: EvaluateContext): unknown[] {
	const result: unknown[] = []
	for (const element of node.elements) {
		if (element == null) {
			result.push(undefined)
			continue
		}
		if (element.type === 'SpreadElement') {
			const spread = evaluateStatic(element.argument, ctx)
			if (!Array.isArray(spread)) {
				fail(element, ctx, 'array spread of a non-array value')
			}
			result.push(...spread)
			continue
		}
		result.push(evaluateStatic(element, ctx))
	}
	return result
}

function evaluateTemplateLiteral(node: t.TemplateLiteral, ctx: EvaluateContext): string {
	let result = ''
	for (const [index, quasi] of node.quasis.entries()) {
		const cooked = quasi.value.cooked
		if (cooked == null) {
			fail(quasi, ctx, 'template literal contains an invalid escape sequence')
		}
		result += cooked
		if (index < node.expressions.length) {
			const value = evaluateStatic(node.expressions[index]!, ctx)
			if (value != null && typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
				fail(node.expressions[index]!, ctx, 'template expression does not evaluate to a primitive')
			}
			result += String(value)
		}
	}
	return result
}

function evaluateUnary(node: t.UnaryExpression, ctx: EvaluateContext): unknown {
	const value = evaluateStatic(node.argument, ctx)
	switch (node.operator) {
		case '-':
			return -(value as number)
		case '+':
			return +(value as number)
		case '!':
			return !value
		case 'void':
			return undefined
		default:
			return fail(node, ctx, `unsupported unary operator "${node.operator}"`)
	}
}

function evaluateBinary(node: t.BinaryExpression, ctx: EvaluateContext): unknown {
	if (node.left.type === 'PrivateName') {
		fail(node.left, ctx, 'private names are not supported')
	}
	const left = evaluateStatic(node.left, ctx)
	const right = evaluateStatic(node.right, ctx)
	switch (node.operator) {
		case '+':
			if (typeof left === 'string' || typeof right === 'string') {
				return `${left}${right}`
			}
			if (typeof left === 'number' && typeof right === 'number') {
				return left + right
			}
			return fail(node, ctx, '"+" on non-string/non-number operands')
		case '-':
			return (left as number) - (right as number)
		case '*':
			return (left as number) * (right as number)
		case '/':
			return (left as number) / (right as number)
		case '===':
			return left === right
		case '!==':
			return left !== right
		default:
			return fail(node, ctx, `unsupported binary operator "${node.operator}"`)
	}
}

function evaluateLogical(node: t.LogicalExpression, ctx: EvaluateContext): unknown {
	const left = evaluateStatic(node.left, ctx)
	switch (node.operator) {
		case '&&':
			return left ? evaluateStatic(node.right, ctx) : left
		case '||':
			return left || evaluateStatic(node.right, ctx)
		case '??':
			return left ?? evaluateStatic(node.right, ctx)
		default:
			return fail(node, ctx, `unsupported logical operator "${(node as t.LogicalExpression).operator}"`)
	}
}

/**
 * Statically evaluates a macro-call argument AST node to a plain value.
 *
 * @param node - The argument expression node.
 * @param ctx - The {@link EvaluateContext} carrying the module id and scope lookup.
 * @returns The evaluated plain value (JSON-serializable by construction, plus `undefined`).
 * @throws {@link PikaTransformError} (stage `'evaluate'`) with the node position when the expression is not static.
 *
 * @remarks
 * Replaces the legacy `new Function()` evaluation of argument source text.
 * Supported: literals, `undefined`/`NaN`/`Infinity` (when unshadowed), unary
 * `- + ! void`, static template literals, object/array expressions (including
 * static computed keys, spreads, and holes), conditional and logical
 * short-circuits, and binary `+ - * / === !==` on static operands.
 */
export function evaluateStatic(node: t.Node, ctx: EvaluateContext): unknown {
	const target = unwrap(node)

	switch (target.type) {
		case 'StringLiteral':
		case 'NumericLiteral':
		case 'BooleanLiteral':
			return target.value
		case 'NullLiteral':
			return null
		case 'Identifier':
			// Own-key lookup only: `in` would also match inherited Object.prototype
			// keys (`toString`, `hasOwnProperty`, ...) and leak their functions.
			if (Object.hasOwn(GLOBAL_CONSTANTS, target.name) && !ctx.hasLocalBinding(target.name)) {
				return GLOBAL_CONSTANTS[target.name]
			}
			return fail(target, ctx, `identifier "${target.name}" is not statically known`)
		case 'TemplateLiteral':
			return evaluateTemplateLiteral(target, ctx)
		case 'ObjectExpression':
			return evaluateObject(target, ctx)
		case 'ArrayExpression':
			return evaluateArray(target, ctx)
		case 'UnaryExpression':
			return evaluateUnary(target, ctx)
		case 'BinaryExpression':
			return evaluateBinary(target, ctx)
		case 'LogicalExpression':
			return evaluateLogical(target, ctx)
		case 'ConditionalExpression':
			return evaluateStatic(target.test, ctx)
				? evaluateStatic(target.consequent, ctx)
				: evaluateStatic(target.alternate, ctx)
		default:
			return fail(target, ctx, `unsupported expression of type ${target.type}`)
	}
}
