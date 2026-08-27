const WRAPPER_NODE_TYPES = new Set([
	'TSNonNullExpression',
	'TSAsExpression',
	'TSSatisfiesExpression',
	'TSTypeAssertion',
	'TSInstantiationExpression',
	'ParenthesizedExpression',
])

function unwrapCallee(node: any): any {
	let current = node
	while (current != null && WRAPPER_NODE_TYPES.has(current.type))
		current = current.expression
	return current
}

/** Extract the root identifier from a call callee, if it has one. */
export function getCalleeRootName(node: { callee: any }): string | null {
	let callee = unwrapCallee(node.callee)
	if (callee?.type === 'ChainExpression')
		callee = unwrapCallee(callee.expression)
	while (callee?.type === 'MemberExpression' || callee?.type === 'OptionalMemberExpression') {
		callee = unwrapCallee(callee.object)
		if (callee?.type === 'ChainExpression')
			callee = unwrapCallee(callee.expression)
	}
	return callee?.type === 'Identifier' ? callee.name : null
}

/** Extract a direct identifier/member callee name for basic root-call checks. */
export function getCalleeName(node: { callee: any, optional?: boolean }): string | null {
	if (node.optional === true)
		return null
	const callee = unwrapCallee(node.callee)
	if (callee?.type === 'ChainExpression')
		return null
	if (callee?.type === 'Identifier')
		return callee.name
	if (callee?.type !== 'MemberExpression' && callee?.type !== 'OptionalMemberExpression')
		return null
	if (callee.optional === true)
		return null
	const object = unwrapCallee(callee.object)
	if (object?.type !== 'Identifier')
		return null
	if (!callee.computed && callee.property?.type === 'Identifier')
		return `${object.name}.${callee.property.name}`
	if (callee.computed && callee.property?.type === 'Literal' && typeof callee.property.value === 'string')
		return `${object.name}.${callee.property.value}`
	return null
}
