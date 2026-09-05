import type * as t from '@babel/types'
import type { TransformErrorStage } from './errors'
import { nodeLoc, PikaTransformError } from './errors'

/** Engine-backed read-side Pika static roots available during Prepare. */
export interface PikaStaticEvaluateContext {
	/** Reserved compile-time root identifier for this analyzed module. */
	readonly fnName: string
	/** Returns whether one first-level static extension root exists. */
	readonly hasStatic: (name: string) => boolean
	/** Reads one first-level static extension implementation. */
	readonly getStatic: (name: string) => unknown | undefined
}

/** Context for bounded static evaluation. */
export interface EvaluateContext {
	/** Normalized absolute path of the module, used in diagnostics. */
	readonly id: string
	/** Pipeline stage owning evaluation errors. @default `'evaluate'` */
	readonly stage?: TransformErrorStage
	/** Recognized static globals shadowed at the analyzed base-call site. */
	readonly shadowedGlobals?: ReadonlySet<string>
	/** Engine-backed Pika static roots. Omitted outside Prepare. */
	readonly pika?: PikaStaticEvaluateContext
}

// MAINTENANCE CONTRACT (#119/#146): the Engine-independent bounded-static
// subset is shared with `packages/_shared/conformance/` and the ESLint
// evaluator (`packages/eslint-config/src/static-evaluate.ts`). Prepare-time
// `ctx.pika` access is intentionally different: the compiler may traverse the
// initialized Engine implementation, while E3/ESLint treats a structurally
// valid static-extension chain as engine-dependent and never executes it.
const GLOBAL_CONSTANTS: Record<string, unknown> = {
	undefined,
	NaN: Number.NaN,
	Infinity: Number.POSITIVE_INFINITY,
}

function fail(node: t.Node, ctx: EvaluateContext, reason: string): never {
	const fnName = ctx.pika?.fnName ?? 'pika'
	throw new PikaTransformError({
		id: ctx.id,
		stage: ctx.stage ?? 'evaluate',
		loc: nodeLoc(node),
		message: `Failed to statically evaluate ${fnName}() argument: ${reason}. `
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

function evaluateMemberKey(node: t.MemberExpression, ctx: EvaluateContext): string | number {
	if (!node.computed) {
		if (node.property.type !== 'Identifier')
			return fail(node.property, ctx, 'static-extension dot access requires an identifier property')
		return node.property.name
	}
	const key = evaluateStatic(node.property, ctx)
	if (typeof key !== 'string' && typeof key !== 'number')
		return fail(node.property, ctx, 'static-extension member key does not evaluate to a string or number')
	return key
}

function collectStaticExtensionPath(node: t.MemberExpression, ctx: EvaluateContext): { root: string, keys: (string | number)[] } | null {
	const keys: (string | number)[] = []
	let current: t.Node = node
	while (true) {
		const target = unwrap(current)
		if (target.type !== 'MemberExpression') {
			if (target.type !== 'Identifier' || target.name !== ctx.pika?.fnName)
				return null
			break
		}
		keys.unshift(evaluateMemberKey(target, ctx))
		current = target.object
	}
	if (keys.length === 0)
		return null
	return { root: String(keys[0]), keys: keys.slice(1) }
}

function isEnumerableSymbolPresent(value: object): boolean {
	return Object.getOwnPropertySymbols(value)
		.some(symbol => Object.prototype.propertyIsEnumerable.call(value, symbol))
}

function isCanonicalArrayIndex(key: string, length: number): boolean {
	if (!/^(?:0|[1-9]\d*)$/.test(key))
		return false
	const index = Number(key)
	return Number.isSafeInteger(index)
		&& index >= 0
		&& index < length
		&& index <= 0xFFFF_FFFE
		&& String(index) === key
}

function materializeStaticTerminal(value: unknown, node: t.Node, ctx: EvaluateContext, seen = new WeakSet<object>()): unknown {
	if (value === null || value === undefined || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
		return value
	if (typeof value === 'function')
		return fail(node, ctx, 'static-extension terminal contains a function')
	if (typeof value === 'symbol')
		return fail(node, ctx, 'static-extension terminal contains a symbol')
	if (typeof value === 'bigint')
		return fail(node, ctx, 'static-extension terminal contains a BigInt')
	if (typeof value !== 'object')
		return fail(node, ctx, `unsupported static-extension terminal type ${typeof value}`)

	if (seen.has(value))
		return fail(node, ctx, 'static-extension terminal contains a cycle or shared object identity')
	seen.add(value)

	try {
		if (isEnumerableSymbolPresent(value))
			return fail(node, ctx, 'static-extension terminal contains an enumerable symbol property')

		if (Array.isArray(value)) {
			if (Object.getPrototypeOf(value) !== Array.prototype)
				return fail(node, ctx, 'static-extension terminal contains a non-plain array runtime object')
			const output: unknown[] = []
			output.length = value.length
			for (const key of Object.keys(value)) {
				if (!isCanonicalArrayIndex(key, value.length))
					return fail(node, ctx, `static-extension terminal array has custom enumerable property "${key}"`)
				output[Number(key)] = materializeStaticTerminal(value[Number(key)], node, ctx, seen)
			}
			return output
		}

		const prototype = Object.getPrototypeOf(value)
		if (prototype !== Object.prototype && prototype !== null)
			return fail(node, ctx, 'static-extension terminal contains a non-plain runtime object')

		const output: Record<string, unknown> = Object.create(prototype === null ? null : Object.prototype)
		for (const key of Object.keys(value)) {
			Object.defineProperty(output, key, {
				value: materializeStaticTerminal((value as Record<string, unknown>)[key], node, ctx, seen),
				enumerable: true,
				writable: true,
				configurable: true,
			})
		}
		return output
	}
	catch (error) {
		if (error instanceof PikaTransformError)
			throw error
		return fail(node, ctx, `static-extension terminal materialization failed: ${error instanceof Error ? error.message : String(error)}`)
	}
}

const NO_STATIC_EXTENSION = Symbol('NO_STATIC_EXTENSION')

function evaluateStaticExtension(node: t.MemberExpression, ctx: EvaluateContext): unknown | typeof NO_STATIC_EXTENSION {
	if (ctx.pika == null)
		return NO_STATIC_EXTENSION
	const path = collectStaticExtensionPath(node, ctx)
	if (path == null)
		return NO_STATIC_EXTENSION
	if (!ctx.pika.hasStatic(path.root))
		return fail(node, ctx, `unknown Pika static-extension root "${path.root}"`)

	let value = ctx.pika.getStatic(path.root)
	try {
		for (const key of path.keys)
			value = (value as any)[key]
	}
	catch (error) {
		return fail(node, ctx, `static-extension property traversal failed: ${error instanceof Error ? error.message : String(error)}`)
	}
	return materializeStaticTerminal(value, node, ctx)
}

/**
 * Evaluates a base `pika(...)` argument list, including call-level spreads.
 * This is the single prepare-time entry for bounded argument evaluation.
 */
export function evaluateCallArguments(
	args: Readonly<t.CallExpression['arguments']>,
	ctx: EvaluateContext,
): unknown[] {
	const result: unknown[] = []
	for (const argument of args) {
		if (argument.type === 'SpreadElement') {
			const spread = evaluateStatic(argument.argument, ctx)
			if (!Array.isArray(spread))
				fail(argument, ctx, 'call spread of a non-array value')
			result.push(...spread)
			continue
		}
		result.push(evaluateStatic(argument, ctx))
	}
	return result
}

/**
 * Statically evaluates a macro-call argument AST node to a plain value.
 *
 * @param node - The argument expression node.
 * @param ctx - The {@link EvaluateContext} carrying module/lexical facts and optional Prepare-time Pika static roots.
 * @returns The evaluated recursively-static value; extension terminals are snapshotted into compiler-owned data.
 * @throws {@link PikaTransformError} at `ctx.stage` (default `'evaluate'`) with the failing node position.
 *
 * @remarks
 * Replaces the legacy `new Function()` evaluation of argument source text.
 * Supported: literals, `undefined`/`NaN`/`Infinity` (when unshadowed), unary
 * `- + ! void`, static template literals, object/array expressions (including
 * static computed keys, spreads, and holes), conditional and logical
 * short-circuits, binary `+ - * / === !==` on static operands, and Prepare-time
 * Pika static-extension member chains supplied through `ctx.pika`.
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
			if (Object.hasOwn(GLOBAL_CONSTANTS, target.name) && !ctx.shadowedGlobals?.has(target.name)) {
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
		case 'MemberExpression': {
			const extension = evaluateStaticExtension(target, ctx)
			return extension === NO_STATIC_EXTENSION
				? fail(target, ctx, 'unsupported expression of type MemberExpression')
				: extension
		}
		default:
			return fail(target, ctx, `unsupported expression of type ${target.type}`)
	}
}
