import ts from 'typescript'

/** True for members that must never appear in generated public API documentation. */
export function isPrivateOrProtectedDeclaration(node: ts.Node): boolean {
	if ('name' in node && node.name != null && ts.isPrivateIdentifier(node.name as ts.Node))
		return true
	if (!ts.canHaveModifiers(node))
		return false
	const modifiers = ts.getModifiers(node)
	return modifiers?.some(m => m.kind === ts.SyntaxKind.PrivateKeyword || m.kind === ts.SyntaxKind.ProtectedKeyword) ?? false
}

/** True when a symbol's JSDoc tags explicitly mark it as internal API. */
export function hasInternalJsDocTag(tags: readonly { name: string }[]): boolean {
	return tags.some(tag => tag.name === 'internal')
}

/** Returns the public call signatures for a function, excluding its implementation signature when overloads exist. */
export function selectFunctionApiDeclarations(declarations: readonly ts.Declaration[]): ts.FunctionDeclaration[] {
	const functions = declarations.filter(ts.isFunctionDeclaration)
	const overloads = functions.filter(declaration => declaration.body == null)
	return overloads.length > 0 ? overloads : functions.slice(0, 1)
}
