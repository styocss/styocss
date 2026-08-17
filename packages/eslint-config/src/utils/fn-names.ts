/**
 * Options for configuring which function name the ESLint rules match against.
 * @internal
 *
 * @remarks
 * By default the rules detect `pika` and its derived variants. Pass a custom
 * `fnName` to match a renamed import or wrapper function instead.
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
 * Builds the set of callee name patterns derived from a base function name.
 * @internal
 *
 * @param fnName - Base function name to derive patterns from.
 * @returns An object containing the base name and the `Set` of recognized callee strings.
 *
 * @remarks
 * For a base name `pika`, the derived names are `pika`, `pika.str`, and
 * `pika.arr`.
 *
 * Keep variant derivation in sync with `createFnConfig` in
 * `@pikacss/integration` (`packages/integration/src/fnConfig.ts`).
 * This copy exists so the ESLint config stays runtime-dependency-free; bracket
 * forms are normalized to these dot forms by `getCalleeName`. The consistency
 * test in `fn-names.test.ts` guards the agreement.
 *
 * @example
 * ```ts
 * const patterns = buildFnNamePatterns('pika')
 * patterns.allNames.has('pika.str') // true
 * ```
 */
export function buildFnNamePatterns(fnName: string = 'pika') {
	// All base callee names (just the identifier or identifier.property)
	const allNames = new Set([
		fnName,
		`${fnName}.str`,
		`${fnName}.arr`,
	])

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
 * `TSSatisfiesExpression`, `TSTypeAssertion` (`<X>pika`), and
 * `ParenthesizedExpression` — recursively, so nested wrappers are peeled off.
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
}): string | null {
	const callee = unwrapExpression(node.callee)
	if (callee.type === 'Identifier') {
		return callee.name
	}
	if (callee.type !== 'MemberExpression')
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
