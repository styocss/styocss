/**
 * Options for configuring which function name the ESLint rules match against.
 * @internal
 *
 * @remarks
 * By default the rules detect the reserved base `pika` call. Pass a custom
 * `fnName` to match a renamed compile-time root instead.
 *
 * @example
 * ```ts
 * const opts: FnNameOptions = { fnName: 'css' }
 * ```
 */
export interface FnNameOptions {
	/**
	 * Base PikaCSS function name the ESLint rules should detect.
	 *
	 * @default `'pika'`
	 */
	fnName?: string
}

/**
 * Builds the configured reserved base-call name.
 * @internal
 *
 * @param fnName - Base function name to derive patterns from.
 * @returns An object containing the base name and the singleton `Set` of recognized base callees.
 *
 * @remarks
 * v1 recognizes exactly one transform-call form: the configured base
 * identifier. Member calls on that unshadowed root are reserved-syntax errors,
 * not additional output-format variants. This copy stays dependency-free while
 * matching `createFnConfig` in `@pikacss/integration`.
 *
 * @example
 * ```ts
 * const patterns = buildFnNamePatterns('pika')
 * patterns.allNames.has('pika') // true
 * ```
 */
export function buildFnNamePatterns(fnName: string = 'pika') {
	const allNames = new Set([fnName])

	return {
		fnName,
		allNames,
	}
}

const wrapperNodeTypes = new Set([
	'TSNonNullExpression',
	'TSAsExpression',
	'TSSatisfiesExpression',
	'TSTypeAssertion',
	'TSInstantiationExpression',
	'ParenthesizedExpression',
])

/**
 * Unwraps TypeScript assertion wrappers and parenthesized expressions.
 * @internal
 *
 * @param node - Expression node possibly wrapped in `!`, `as`, `satisfies`, `<T>`, or parentheses.
 * @returns The innermost unwrapped expression node.
 *
 * @remarks
 * Handles `TSNonNullExpression` (`pika!`), `TSAsExpression` (`pika as X`),
 * `TSSatisfiesExpression`, `TSTypeAssertion` (`<X>pika`),
 * `TSInstantiationExpression` (`pika<T>`), and `ParenthesizedExpression` —
 * recursively, so nested wrappers are peeled off. Kept in sync with the
 * compiler collector's wrapper set (see the #119 conformance corpus).
 *
 * @example
 * ```ts
 * // Given an AST node for `(pika as X)!`
 * unwrapExpression(node) // Identifier node for `pika`
 * ```
 */
function unwrapExpression(node: any): any {
	let current = node
	while (current != null && wrapperNodeTypes.has(current.type))
		current = current.expression
	return current
}

/**
 * Extracts the ROOT identifier name of a call-expression callee — the `pika`
 * in `pika(...)`, `pika.str(...)`, or `pika['str'](...)`.
 * @internal
 *
 * @param node - EST call-expression node with a `callee` property.
 * @param node.type - The ESTree node type.
 * @param node.callee - The callee subtree to inspect.
 * @returns The root identifier name, or `null` when the callee root is not a plain identifier.
 *
 * @remarks
 * Used to resolve the callee against the ESLint scope: when the root is a local
 * binding (import, variable, parameter, function/class declaration) the call is
 * the user's own function, not a PikaCSS macro, and the rule must skip it — the
 * same shadowing semantics the transformer applies via Babel scope.
 */
export function getCalleeRootName(node: {
	type: string
	callee: any
}): string | null {
	const callee = unwrapExpression(node.callee)
	if (callee.type === 'Identifier')
		return callee.name
	if (callee.type === 'MemberExpression') {
		const calleeObject = unwrapExpression(callee.object)
		if (calleeObject.type === 'Identifier')
			return calleeObject.name
	}
	return null
}

/**
 * Extracts the full callee name from a call-expression AST node.
 * @internal
 *
 * @param node - EST call-expression node with a `callee` property.
 * @param node.type - The ESTree node type.
 * @param node.callee - The callee subtree to inspect.
 * @param node.optional - Whether the call itself is optional (`pika?.(...)`); optional calls are never macros.
 * @returns The dot-joined callee string (e.g. `'pika.str'`), or `null` if the callee shape is unsupported.
 *
 * @remarks
 * Handles plain identifiers (`pika`), non-computed member expressions
 * (`pika.str`), computed literal keys (`pika['str']`), and static
 * template-literal keys (`` pika[`str`] ``). TypeScript assertion wrappers
 * (`pika!`, `pika as X`, `pika satisfies X`, `<X>pika`) and parentheses are
 * unwrapped before extraction. Returns `null` for anything more complex.
 *
 * @example
 * ```ts
 * // Given an AST node for `pika.str('...')`
 * getCalleeName(node) // 'pika.str'
 * ```
 */
export function getCalleeName(node: {
	type: string
	callee: any
	optional?: boolean
}): string | null {
	// Optional calls (`pika?.(...)`) and optional member calls
	// (`pika?.str(...)`, `pika.str?.(...)`) are never transformed by the
	// compiler (Babel represents them as Optional* nodes its collector does
	// not visit), so the rule must ignore them too (#119).
	if (node.optional === true)
		return null
	const callee = unwrapExpression(node.callee)
	if (callee.type === 'Identifier') {
		return callee.name
	}
	if (callee.type !== 'MemberExpression')
		return null
	if (callee.optional === true)
		return null
	const calleeObject = unwrapExpression(callee.object)
	if (calleeObject.type !== 'Identifier')
		return null
	if (
		!callee.computed
		&& callee.property.type === 'Identifier'
	) {
		return `${calleeObject.name}.${callee.property.name}`
	}
	if (callee.computed) {
		if (callee.property.type === 'Literal' && typeof callee.property.value === 'string')
			return `${calleeObject.name}.${callee.property.value}`
		if (
			callee.property.type === 'TemplateLiteral'
			&& callee.property.expressions.length === 0
			&& callee.property.quasis.length === 1
		) {
			return `${calleeObject.name}.${callee.property.quasis[0]!.value.cooked ?? ''}`
		}
	}
	return null
}
