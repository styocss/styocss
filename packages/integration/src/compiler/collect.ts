import type { NodePath } from '@babel/traverse'
import type * as t from '@babel/types'
import type { FnConfig } from '../fnConfig'
import _traverse from '@babel/traverse'
import { nodeLoc, PikaTransformError } from './errors'

const traverse = ((_traverse as any).default ?? _traverse) as typeof _traverse

/** Base transform call found during collection. `path` is collector-local only. */
export interface CollectedCall {
	readonly node: t.CallExpression
	readonly path: NodePath<t.CallExpression>
}

/** Collector context for reserved-root classification. */
export interface CollectMacroCallsOptions {
	readonly id: string
	readonly excludedRoots?: ReadonlySet<string>
}

export function unwrapExpression(node: t.Node): t.Node {
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

function isTransparentWrapper(path: NodePath): boolean {
	return path.isTSNonNullExpression()
		|| path.isTSAsExpression()
		|| path.isTSSatisfiesExpression()
		|| path.isTSTypeAssertion()
		|| path.isTSInstantiationExpression()
		|| path.isParenthesizedExpression()
}

function climbTransparent(path: NodePath): NodePath {
	let current = path
	while (current.parentPath != null && isTransparentWrapper(current.parentPath))
		current = current.parentPath
	return current
}

function failReserved(path: NodePath, options: CollectMacroCallsOptions, fnName: string, reason: string): never {
	throw new PikaTransformError({
		id: options.id,
		stage: 'collect',
		loc: nodeLoc(path.node),
		message: `Invalid ${fnName} compile-time syntax: ${reason}`,
	})
}

function isUnshadowedRoot(path: NodePath<t.Identifier>, fnName: string, options: CollectMacroCallsOptions): boolean {
	return path.node.name === fnName
		&& !options.excludedRoots?.has(fnName)
		&& path.scope.getBinding(fnName) == null
}

function isUnshadowedJsxRoot(path: NodePath<t.JSXIdentifier>, fnName: string, options: CollectMacroCallsOptions): boolean {
	return path.node.name === fnName
		&& path.isReferencedIdentifier()
		&& !options.excludedRoots?.has(fnName)
		&& path.scope.getBinding(fnName) == null
}

function isWriteTarget(path: NodePath<t.Identifier>): boolean {
	let current: NodePath = path
	while (current.parentPath != null) {
		const parent = current.parentPath
		if (parent.isAssignmentExpression())
			return parent.node.left === current.node
		if (parent.isForInStatement() || parent.isForOfStatement())
			return parent.node.left === current.node
		if (parent.isArrayPattern() || parent.isObjectPattern()) {
			current = parent
			continue
		}
		if (parent.isObjectProperty()) {
			if (current.key !== 'value')
				return false
			current = parent
			continue
		}
		if (parent.isRestElement()) {
			if (current.key !== 'argument')
				return false
			current = parent
			continue
		}
		if (parent.isAssignmentPattern()) {
			if (current.key !== 'left')
				return false
			current = parent
			continue
		}
		return false
	}
	return false
}

function isRootOccurrence(path: NodePath<t.Identifier>): boolean {
	return path.isReferencedIdentifier() || isWriteTarget(path)
}

function climbStaticMemberChain(rootPath: NodePath<t.Identifier>, options: CollectMacroCallsOptions, fnName: string): NodePath | null {
	let current = climbTransparent(rootPath)
	let foundMember = false

	while (current.parentPath != null) {
		const parent = current.parentPath
		if (parent.isOptionalMemberExpression() && parent.node.object === current.node)
			failReserved(parent, options, fnName, 'optional static-extension member access is not supported')
		if (!parent.isMemberExpression() || parent.node.object !== current.node)
			break

		foundMember = true
		if (parent.node.computed && parent.node.property.type === 'PrivateName') {
			failReserved(parent.get('property') as NodePath, options, fnName, 'private static-extension member access is not supported')
		}
		else if (!parent.node.computed && !parent.get('property')
			.isIdentifier()) {
			failReserved(parent.get('property') as NodePath, options, fnName, 'dot static-extension access requires an identifier property')
		}
		current = climbTransparent(parent)
	}

	return foundMember ? current : null
}

function isBaseCallPath(path: NodePath<t.CallExpression>, fnName: string): boolean {
	const callee = unwrapExpression(path.node.callee)
	if (callee.type !== 'Identifier' || callee.name !== fnName)
		return false
	return path.scope.getBinding(fnName) == null
}

function isInsideBaseCallArguments(path: NodePath, fnName: string): boolean {
	let child = path
	let parent = path.parentPath
	while (parent != null) {
		if (parent.isCallExpression() && isBaseCallPath(parent, fnName))
			return (parent.node.arguments as readonly t.Node[]).includes(child.node)
		child = parent
		parent = parent.parentPath
	}
	return false
}

function validateStaticChainUsage(chainPath: NodePath, fnName: string, options: CollectMacroCallsOptions): void {
	const parent = chainPath.parentPath
	if (parent?.isOptionalCallExpression() === true && parent.node.callee === chainPath.node)
		failReserved(parent, options, fnName, 'optional calls on static-extension members are not supported')
	if (parent?.isCallExpression() === true && parent.node.callee === chainPath.node)
		failReserved(parent, options, fnName, 'static-extension members are values, not callable members')
	if (parent?.isNewExpression() === true && parent.node.callee === chainPath.node)
		failReserved(parent, options, fnName, 'static-extension members cannot be constructed')
	if (parent?.isTaggedTemplateExpression() === true && parent.node.tag === chainPath.node)
		failReserved(parent, options, fnName, 'static-extension members cannot be used as template tags')
	if (parent?.isAssignmentExpression() === true && parent.node.left === chainPath.node)
		failReserved(parent, options, fnName, 'static-extension members cannot be assignment targets')
	if (parent?.isUpdateExpression() === true && parent.node.argument === chainPath.node)
		failReserved(parent, options, fnName, 'static-extension members cannot be update targets')
	if (parent?.isUnaryExpression({ operator: 'delete' }) === true && parent.node.argument === chainPath.node)
		failReserved(parent, options, fnName, 'static-extension members cannot be deleted')
	if (!isInsideBaseCallArguments(chainPath, fnName))
		failReserved(chainPath, options, fnName, 'static-extension member access is only valid inside a base transform call argument')
}

function validateNoNestedBaseCalls(found: CollectedCall[], options: CollectMacroCallsOptions, fnName: string): void {
	const sorted = [...found].sort((a, b) => a.node.start! - b.node.start!)
	const stack: CollectedCall[] = []
	for (const call of sorted) {
		while (stack.length > 0 && call.node.start! >= stack.at(-1)!.node.end!)
			stack.pop()
		if (stack.length > 0 && call.node.end! <= stack.at(-1)!.node.end!)
			failReserved(call.path, options, fnName, 'nested base transform calls are not supported')
		stack.push(call)
	}
}

/**
 * Classifies every unshadowed configured-root occurrence and collects only base
 * transform calls. The configured root is reserved compile-time syntax: an
 * occurrence is legal only as a base call callee or as one maximal static
 * member chain inside a base call's argument tree. All other unshadowed uses
 * fail analysis instead of leaking runtime `pika` references.
 */
export function collectMacroCalls(ast: t.File, fnConfig: FnConfig, options: CollectMacroCallsOptions): CollectedCall[] {
	const found: CollectedCall[] = []
	traverse(ast, {
		JSXIdentifier(path) {
			if (!isUnshadowedJsxRoot(path, fnConfig.fnName, options))
				return
			failReserved(path, options, fnConfig.fnName, 'the reserved root cannot be used as a JSX component value')
		},
		Identifier(path) {
			if (path.node.name !== fnConfig.fnName || !isRootOccurrence(path) || !isUnshadowedRoot(path, fnConfig.fnName, options))
				return

			const direct = climbTransparent(path)
			const parent = direct.parentPath
			if (parent?.isCallExpression() === true && parent.node.callee === direct.node) {
				found.push({ node: parent.node, path: parent })
				return
			}

			const chain = climbStaticMemberChain(path, options, fnConfig.fnName)
			if (chain != null) {
				validateStaticChainUsage(chain, fnConfig.fnName, options)
				return
			}

			failReserved(path, options, fnConfig.fnName, 'the reserved root may only be called directly or used as a static-extension member chain inside that call')
		},
	})

	validateNoNestedBaseCalls(found, options, fnConfig.fnName)
	return found
}
