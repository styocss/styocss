import type { Rule, Scope } from 'eslint'
import type { LintProjectModel } from '../lint-project'
import { isAbsolute, normalize } from 'pathe'
import { evaluateObjectKey, evaluateStatic, getDynamicReason, isShadowedByDeclaration, unwrap } from '../static-evaluate'
import { getCalleeName, getCalleeRootName } from '../utils/fn-names'

type AnyNode = Record<string, any> & { type: string }

interface BaseCallRecord {
	readonly node: AnyNode
	readonly fnName: string
	invalid: boolean
}

interface StaticMemberChain {
	readonly node: AnyNode
	readonly invalidReason?: string
}

function reportDynamicNode(
	context: Rule.RuleContext,
	node: AnyNode,
	messageId: 'noDynamicArg' | 'noDynamicProperty' | 'noDynamicSpread' | 'noDynamicComputedKey',
	fnName: string,
	reason?: string,
): void {
	context.report({
		node,
		messageId,
		data: reason == null ? { fnName } : { fnName, reason },
	})
}

function reportInvalidSyntax(context: Rule.RuleContext, node: AnyNode, fnName: string, reason: string): void {
	context.report({
		node,
		messageId: 'invalidPikaSyntax',
		data: { fnName, reason },
	})
}

function getScope(context: Rule.RuleContext, node: AnyNode): Scope.Scope | null | undefined {
	return (context.sourceCode as any).getScope?.(node)
}

function getUsablePhysicalFilename(context: Rule.RuleContext): string | null {
	const candidate = (context as any).physicalFilename ?? (context as any).filename
	if (typeof candidate !== 'string' || !isAbsolute(candidate))
		return null
	return normalize(candidate)
}

function getRootIdentifier(node: AnyNode | null | undefined): AnyNode | null {
	const current = unwrap(node)
	if (current == null)
		return null
	if (current.type === 'ChainExpression')
		return getRootIdentifier(current.expression)
	if (current.type === 'Identifier')
		return current
	if (current.type === 'MemberExpression' || current.type === 'OptionalMemberExpression')
		return getRootIdentifier(current.object)
	return null
}

function getParent(node: AnyNode | null | undefined): AnyNode | null {
	return node?.parent ?? null
}

function isTransparentParent(parent: AnyNode, child: AnyNode): boolean {
	return (
		parent.type === 'TSNonNullExpression'
		|| parent.type === 'TSAsExpression'
		|| parent.type === 'TSSatisfiesExpression'
		|| parent.type === 'TSTypeAssertion'
		|| parent.type === 'TSInstantiationExpression'
		|| parent.type === 'ParenthesizedExpression'
		|| parent.type === 'ChainExpression'
	) && parent.expression === child
}

function climbTransparent(node: AnyNode): AnyNode {
	let current = node
	let parent = getParent(current)
	while (parent != null && isTransparentParent(parent, current)) {
		current = parent
		parent = getParent(current)
	}
	return current
}

function getStaticObjectKey(node: AnyNode): string | null {
	if (node.type !== 'Property')
		return null
	if (!node.computed && node.key?.type === 'Identifier')
		return node.key.name
	if (node.key?.type === 'Literal' && (typeof node.key.value === 'string' || typeof node.key.value === 'number'))
		return String(node.key.value)
	return null
}

function addConfiguredObjectKeys(node: AnyNode | null | undefined, roots: readonly string[], target: Set<string>): void {
	if (node?.type !== 'ObjectExpression')
		return
	for (const property of node.properties ?? []) {
		const key = getStaticObjectKey(property)
		if (key != null && roots.includes(key))
			target.add(key)
	}
}

function addConfiguredArrayValues(node: AnyNode | null | undefined, roots: readonly string[], target: Set<string>): void {
	if (node?.type !== 'ArrayExpression')
		return
	for (const element of node.elements ?? []) {
		if (element?.type === 'Literal' && typeof element.value === 'string' && roots.includes(element.value))
			target.add(element.value)
	}
}

function addReturnedConfiguredObjectKeys(node: AnyNode | null | undefined, roots: readonly string[], target: Set<string>): void {
	if (node == null || (node.type !== 'FunctionExpression' && node.type !== 'ArrowFunctionExpression'))
		return
	if (node.body?.type === 'ObjectExpression') {
		addConfiguredObjectKeys(node.body, roots, target)
		return
	}
	if (node.body?.type !== 'BlockStatement')
		return
	for (const statement of node.body.body ?? []) {
		if (statement.type === 'ReturnStatement')
			addConfiguredObjectKeys(statement.argument, roots, target)
	}
}

function collectVueOptionsExposedRoots(node: AnyNode, roots: readonly string[], target: Set<string>): void {
	const options = unwrap(node.declaration)
	if (options.type !== 'ObjectExpression')
		return
	for (const property of options.properties ?? []) {
		const key = getStaticObjectKey(property)
		if (key == null || property.type !== 'Property')
			continue
		if (key === 'methods' || key === 'computed') {
			addConfiguredObjectKeys(property.value, roots, target)
		}
		else if (key === 'props' || key === 'inject') {
			addConfiguredObjectKeys(property.value, roots, target)
			addConfiguredArrayValues(property.value, roots, target)
		}
		else if (key === 'setup' || key === 'data') {
			addReturnedConfiguredObjectKeys(property.value, roots, target)
		}
	}
}

function isReferenceIdentifier(node: AnyNode): boolean {
	const parent = getParent(node)
	if (parent == null)
		return true

	if (parent.type === 'Property' && parent.key === node && !parent.computed && parent.value !== node)
		return false
	if ((parent.type === 'TSPropertySignature' || parent.type === 'TSMethodSignature') && parent.key === node && !parent.computed)
		return false
	if (parent.type === 'Property' && parent.value === node && parent.parent?.type === 'ObjectPattern')
		return false
	if ((parent.type === 'MemberExpression' || parent.type === 'OptionalMemberExpression') && parent.property === node && !parent.computed)
		return false
	if (parent.type === 'AssignmentExpression' && parent.left === node)
		return false
	if (parent.type === 'UpdateExpression' && parent.argument === node)
		return false
	if ((parent.type === 'ForInStatement' || parent.type === 'ForOfStatement') && parent.left === node)
		return false
	if (parent.type === 'UnaryExpression' && parent.operator === 'delete' && parent.argument === node)
		return false
	if ((parent.type === 'MethodDefinition' || parent.type === 'PropertyDefinition' || parent.type === 'AccessorProperty') && parent.key === node && !parent.computed)
		return false
	if (parent.type === 'LabeledStatement' || parent.type === 'BreakStatement' || parent.type === 'ContinueStatement')
		return false
	if (parent.type === 'VariableDeclarator' && parent.id === node)
		return false
	if (parent.type === 'ArrayPattern' && parent.elements?.includes(node))
		return false
	if (parent.type === 'ObjectPattern' && parent.properties?.includes(node))
		return false
	if (parent.type === 'RestElement' && parent.argument === node)
		return false
	if (parent.type === 'AssignmentPattern' && parent.left === node)
		return false
	if ((parent.type === 'FunctionDeclaration' || parent.type === 'FunctionExpression' || parent.type === 'ClassDeclaration' || parent.type === 'ClassExpression') && parent.id === node)
		return false
	if (parent.type === 'ImportSpecifier' || parent.type === 'ImportDefaultSpecifier' || parent.type === 'ImportNamespaceSpecifier')
		return false

	return true
}

function isWriteTarget(node: AnyNode): boolean {
	let current = node
	while (true) {
		const parent = getParent(current)
		if (parent == null)
			return false
		if (parent.type === 'AssignmentExpression')
			return parent.left === current
		if (parent.type === 'UpdateExpression')
			return parent.argument === current
		if (parent.type === 'ForInStatement' || parent.type === 'ForOfStatement')
			return parent.left === current
		if (parent.type === 'UnaryExpression' && parent.operator === 'delete')
			return parent.argument === current
		if (parent.type === 'ArrayPattern' || parent.type === 'ObjectPattern' || parent.type === 'RestElement') {
			current = parent
			continue
		}
		if (parent.type === 'AssignmentPattern' && parent.left === current) {
			current = parent
			continue
		}
		if (parent.type === 'Property' && parent.value === current) {
			current = parent
			continue
		}
		return false
	}
}

function isWithinArgument(node: AnyNode, call: BaseCallRecord): boolean {
	let current = node
	while (true) {
		const parent = getParent(current)
		if (parent == null)
			return false
		if (parent === call.node)
			return call.node.arguments?.includes(current) === true
		current = parent
	}
}

function findContainingBaseCall(node: AnyNode, baseCalls: WeakMap<object, BaseCallRecord>): BaseCallRecord | null {
	let current = getParent(node)
	while (current != null) {
		const call = baseCalls.get(current)
		if (call != null && isWithinArgument(node, call))
			return call
		current = getParent(current)
	}
	return null
}

function isMemberNode(node: AnyNode | null): boolean {
	return node?.type === 'MemberExpression' || node?.type === 'OptionalMemberExpression'
}

function getStaticExtensionMemberKeyReason(
	property: AnyNode | null | undefined,
	scope: Scope.Scope | null | undefined,
	fnName: string,
): string | undefined {
	const key = evaluateStatic(property, scope, fnName)
	if (key.kind === 'engine-dependent')
		return undefined
	if (key.kind === 'known' && (typeof key.value === 'string' || typeof key.value === 'number'))
		return undefined
	return 'computed static-extension member keys must be statically evaluable strings or numbers'
}

/** Find the maximal member chain above a configured root without evaluating it. */
function findMaximalMemberChain(root: AnyNode, scope: Scope.Scope | null | undefined, fnName: string): StaticMemberChain | null {
	let current = climbTransparent(root)
	let foundMember = false
	let invalidReason: string | undefined
	while (true) {
		const parent = getParent(current)
		if (parent == null)
			break
		if (isTransparentParent(parent, current)) {
			current = parent
			continue
		}
		if (!isMemberNode(parent) || parent.object !== current)
			break
		foundMember = true
		if (parent.type === 'OptionalMemberExpression' || parent.optional === true)
			invalidReason ??= 'optional static-extension member access is not supported'
		else if (parent.property?.type === 'PrivateIdentifier' || parent.property?.type === 'PrivateName')
			invalidReason ??= 'private static-extension member access is not supported'
		else if (!parent.computed && parent.property?.type !== 'Identifier')
			invalidReason ??= 'dot static-extension access requires an identifier property'
		else if (parent.computed)
			invalidReason ??= getStaticExtensionMemberKeyReason(parent.property, scope, fnName)
		current = parent
	}
	return foundMember ? { node: current, invalidReason } : null
}

function isBaseCall(node: AnyNode, fnName: string): boolean {
	return getCalleeName(node as unknown as { callee: any, optional?: boolean }) === fnName && node.optional !== true
}

function isInsideBaseCallArguments(node: AnyNode, fnName: string): boolean {
	let child = node
	let parent = getParent(node)
	while (parent != null) {
		if (parent.type === 'CallExpression' && isBaseCall(parent, fnName))
			return parent.arguments?.includes(child) === true
		child = parent
		parent = getParent(parent)
	}
	return false
}

function getMemberChainContextReason(chain: StaticMemberChain, fnName: string): string | null {
	if (chain.invalidReason != null)
		return chain.invalidReason

	const parent = getParent(chain.node)
	if (parent?.type === 'OptionalCallExpression' && parent.callee === chain.node)
		return 'optional calls on static-extension members are not supported'
	if (parent?.type === 'CallExpression' && parent.callee === chain.node) {
		return parent.optional === true
			? 'optional calls on static-extension members are not supported'
			: 'static-extension members are values, not callable members'
	}
	if (parent?.type === 'NewExpression' && parent.callee === chain.node)
		return 'static-extension members cannot be constructed'
	if (parent?.type === 'TaggedTemplateExpression' && parent.tag === chain.node)
		return 'static-extension members cannot be used as template tags'
	if (parent?.type === 'AssignmentExpression' && parent.left === chain.node)
		return 'static-extension members cannot be assignment targets'
	if (parent?.type === 'UpdateExpression' && parent.argument === chain.node)
		return 'static-extension members cannot be update targets'
	if (parent?.type === 'UnaryExpression' && parent.operator === 'delete' && parent.argument === chain.node)
		return 'static-extension members cannot be deleted'
	if (!isInsideBaseCallArguments(chain.node, fnName))
		return 'static-extension member access is only valid inside a base transform call argument'
	return null
}

function createRule(model: LintProjectModel): Rule.RuleModule {
	return {
		meta: {
			type: 'problem',
			docs: {
				description: 'Enforce compiler-aligned static usage of configured PikaCSS roots.',
				url: 'https://github.com/pikacss/pikacss/blob/main/packages/eslint-config/docs/rules/static-usage.md',
			},
			messages: {
				noDynamicArg: 'PikaCSS static-subset violation: {{ reason }}. All arguments to {{ fnName }}() must stay within the predictable literal subset enforced by this rule.',
				noDynamicProperty: 'PikaCSS static-subset violation: {{ reason }}. All property values in {{ fnName }}() arguments must stay within the predictable literal subset enforced by this rule.',
				noDynamicSpread: 'PikaCSS static-subset violation: Spread of dynamic value is not allowed in {{ fnName }}() arguments. Only spreads of static arrays (in arrays and call arguments) or static objects (in object literals) are permitted.',
				noDynamicComputedKey: 'PikaCSS static-subset violation: Computed property key {{ reason }}. Only static string or number computed keys are allowed in {{ fnName }}() arguments.',
				invalidPikaSyntax: 'Invalid {{ fnName }} compile-time syntax: {{ reason }}.',
				outsideScan: 'Configured PikaCSS root {{ fnName }} is used outside the scan scope of its owning entry.',
				crossEntryDependency: 'PikaCSS base call {{ baseFnName }}() cannot depend on configured root {{ dependencyFnName }} from another entry.',
			},
			schema: [],
		},
		create(context) {
			const physicalFilename = getUsablePhysicalFilename(context)
			// A physical source is matched once for this rule invocation. ESLint's
			// file applicability remains independent from Pika scan ownership.
			const matchedEntries = physicalFilename == null
				? null
				: Object.freeze(model.entries.filter(entry => entry.matcher.matches(physicalFilename)))
			const baseCalls = new WeakMap<object, BaseCallRecord>()
			const handledCalleeRoots = new WeakSet<object>()
			const reportedOutsideRoots = new WeakSet<object>()
			const reportedCrossDependencies = new WeakSet<object>()
			const vueTemplateShadowedNodes = new WeakSet<object>()

			const isConfiguredRoot = (name: string | null): name is string => name != null && model.roots.includes(name)
			const vueExposedRoots = new Set<string>()
			for (const scope of ((context.sourceCode as any).scopeManager?.scopes ?? [])) {
				for (const variable of scope.variables ?? []) {
					if (!isConfiguredRoot(variable.name))
						continue
					if ((variable.references ?? []).some((reference: any) => reference.vueUsedInTemplate === true))
						vueExposedRoots.add(variable.name)
				}
			}
			const isRootShadowed = (node: AnyNode, inVueTemplate = false): boolean => (
				isShadowedByDeclaration(node.name, getScope(context, node))
				|| (inVueTemplate && (vueTemplateShadowedNodes.has(node) || vueExposedRoots.has(node.name)))
			)

			function reportOutsideScan(rootNode: AnyNode, fnName: string): void {
				if (physicalFilename == null || reportedOutsideRoots.has(rootNode))
					return
				reportedOutsideRoots.add(rootNode)
				context.report({
					node: rootNode,
					messageId: 'outsideScan',
					data: { fnName },
				})
			}

			function ownsRoot(fnName: string): boolean {
				return matchedEntries?.some(entry => entry.fnName === fnName) ?? true
			}

			function reportCrossEntry(baseCall: BaseCallRecord, rootNode: AnyNode, dependencyFnName: string): void {
				if (dependencyFnName === baseCall.fnName || reportedCrossDependencies.has(rootNode))
					return
				reportedCrossDependencies.add(rootNode)
				baseCall.invalid = true
				context.report({
					node: rootNode,
					messageId: 'crossEntryDependency',
					data: { baseFnName: baseCall.fnName, dependencyFnName },
				})
			}

			function reportRootSyntax(rootNode: AnyNode, fnName: string, reason: string, containingCall?: BaseCallRecord | null): void {
				if (containingCall != null)
					containingCall.invalid = true
				reportInvalidSyntax(context, rootNode, fnName, reason)
			}

			function inspectRootUse(rootNode: AnyNode, inVueTemplate = false): void {
				const fnName = rootNode.name
				if (!isConfiguredRoot(fnName) || isRootShadowed(rootNode, inVueTemplate))
					return
				if (!isReferenceIdentifier(rootNode) && !isWriteTarget(rootNode))
					return
				if (handledCalleeRoots.has(rootNode))
					return

				const chain = findMaximalMemberChain(rootNode, getScope(context, rootNode), fnName)
				const containingCall = findContainingBaseCall(chain?.node ?? rootNode, baseCalls)
				if (containingCall != null) {
					if (!ownsRoot(fnName))
						reportOutsideScan(rootNode, fnName)
					if (chain == null) {
						reportRootSyntax(rootNode, fnName, 'the reserved root may only be called directly or used as a static-extension member chain inside that call', containingCall)
						return
					}
					const reason = getMemberChainContextReason(chain, containingCall.fnName)
					if (reason != null) {
						reportRootSyntax(chain.node, fnName, reason, containingCall)
						return
					}
					reportCrossEntry(containingCall, rootNode, fnName)
					return
				}

				if (!ownsRoot(fnName))
					reportOutsideScan(rootNode, fnName)
				if (chain == null) {
					reportRootSyntax(rootNode, fnName, 'the reserved root may only be called directly or used as a static-extension member chain inside that call')
					return
				}
				const reason = getMemberChainContextReason(chain, fnName)
				reportRootSyntax(chain.node, fnName, reason ?? 'the reserved root may only be called directly or used as a static-extension member chain inside that call')
			}

			function validateObjectExpression(argNode: AnyNode, fnName: string, scope: Scope.Scope | null | undefined): void {
				for (const prop of argNode.properties ?? []) {
					if (prop.type === 'SpreadElement') {
						const spread = evaluateStatic(prop.argument, scope, fnName)
						if (spread.kind === 'invalid')
							reportDynamicNode(context, spread.node ?? prop, 'noDynamicSpread', fnName, spread.reason)
						else if (spread.kind === 'known' && (spread.value == null || typeof spread.value !== 'object' || Array.isArray(spread.value)))
							reportDynamicNode(context, prop, 'noDynamicSpread', fnName)
						continue
					}

					if (prop.type !== 'Property') {
						reportDynamicNode(context, prop, 'noDynamicProperty', fnName, getDynamicReason(prop))
						continue
					}

					const key = evaluateObjectKey(prop, scope, fnName)
					if (key.kind === 'invalid') {
						if (prop.computed)
							reportDynamicNode(context, key.node ?? prop.key, 'noDynamicComputedKey', fnName, key.reason)
						else
							reportDynamicNode(context, key.node ?? prop.key, 'noDynamicProperty', fnName, key.reason)
					}

					const value = evaluateStatic(prop.value, scope, fnName)
					if (value.kind !== 'invalid')
						continue
					const unwrapped = unwrap(prop.value)
					if (unwrapped?.type === 'ObjectExpression' || unwrapped?.type === 'ArrayExpression')
						validateArg(prop.value, fnName, scope)
					else
						reportDynamicNode(context, value.node ?? prop.value ?? prop, 'noDynamicProperty', fnName, value.node == null ? getDynamicReason(prop) : value.reason)
				}
			}

			function validateArrayExpression(argNode: AnyNode, fnName: string, scope: Scope.Scope | null | undefined): void {
				for (const el of argNode.elements ?? []) {
					if (el == null)
						continue
					if (el.type === 'SpreadElement') {
						const spread = evaluateStatic(el.argument, scope, fnName)
						if (spread.kind === 'invalid')
							reportDynamicNode(context, spread.node ?? el, 'noDynamicSpread', fnName, spread.reason)
						else if (spread.kind === 'known' && !Array.isArray(spread.value))
							reportDynamicNode(context, el, 'noDynamicSpread', fnName)
						continue
					}
					const value = evaluateStatic(el, scope, fnName)
					if (value.kind !== 'invalid')
						continue
					const unwrapped = unwrap(el)
					if (unwrapped?.type === 'ObjectExpression' || unwrapped?.type === 'ArrayExpression')
						validateArg(el, fnName, scope)
					else
						reportDynamicNode(context, value.node ?? el, 'noDynamicArg', fnName, value.node == null ? getDynamicReason(el) : value.reason)
				}
			}

			function validateArg(argNode: AnyNode, fnName: string, scope: Scope.Scope | null | undefined): void {
				const result = evaluateStatic(argNode, scope, fnName)
				if (result.kind !== 'invalid')
					return

				const unwrapped = unwrap(argNode)
				if (unwrapped?.type === 'ObjectExpression') {
					validateObjectExpression(unwrapped, fnName, scope)
					return
				}
				if (unwrapped?.type === 'ArrayExpression') {
					validateArrayExpression(unwrapped, fnName, scope)
					return
				}
				reportDynamicNode(context, result.node ?? argNode, 'noDynamicArg', fnName, result.node == null ? getDynamicReason(argNode) : result.reason)
			}

			function validateBaseCall(call: BaseCallRecord): void {
				if (call.invalid)
					return
				const scope = getScope(context, call.node)
				for (const arg of call.node.arguments ?? []) {
					if (arg.type === 'SpreadElement') {
						const spread = evaluateStatic(arg.argument, scope, call.fnName)
						if (spread.kind === 'invalid')
							reportDynamicNode(context, spread.node ?? arg, 'noDynamicSpread', call.fnName, spread.reason)
						else if (spread.kind === 'known' && !Array.isArray(spread.value))
							reportDynamicNode(context, arg, 'noDynamicSpread', call.fnName)
						continue
					}
					validateArg(arg, call.fnName, scope)
				}
			}

			function inspectCall(node: AnyNode, inVueTemplate = false): void {
				const rootNode = getRootIdentifier(node.callee)
				const rootName = getCalleeRootName(node as unknown as { callee: any })
				if (rootNode == null || !isConfiguredRoot(rootName) || isRootShadowed(rootNode, inVueTemplate))
					return
				handledCalleeRoots.add(rootNode)

				const directBaseCall = getCalleeName(node as unknown as { callee: any, optional?: boolean }) === rootName && node.optional !== true
				if (!directBaseCall) {
					if (!ownsRoot(rootName))
						reportOutsideScan(rootNode, rootName)
					const reason = node.optional === true
						? 'optional calls on the reserved root are not supported'
						: 'the reserved root may only be called directly or used as a static-extension member chain inside that call'
					const containingCall = findContainingBaseCall(node, baseCalls)
					if (containingCall != null)
						containingCall.invalid = true
					reportInvalidSyntax(context, node.callee ?? node, rootName, reason)
					return
				}

				const record: BaseCallRecord = { node, fnName: rootName, invalid: false }
				baseCalls.set(node, record)
				if (!ownsRoot(rootName)) {
					reportOutsideScan(rootNode, rootName)
					record.invalid = true
				}

				const containingCall = findContainingBaseCall(node, baseCalls)
				if (containingCall == null)
					return
				if (rootName === containingCall.fnName) {
					record.invalid = true
					containingCall.invalid = true
					reportInvalidSyntax(context, node.callee ?? node, rootName, 'nested base transform calls are not supported')
				}
				else {
					record.invalid = true
					reportCrossEntry(containingCall, rootNode, rootName)
				}
			}

			function validateCallOnExit(node: AnyNode): void {
				const call = baseCalls.get(node)
				if (call != null)
					validateBaseCall(call)
			}

			const scriptVisitor: Rule.RuleListener = {
				'ExportDefaultDeclaration': (node: AnyNode) => collectVueOptionsExposedRoots(node, model.roots, vueExposedRoots),
				'CallExpression': inspectCall,
				'CallExpression:exit': validateCallOnExit,
				'Identifier': inspectRootUse,
			}

			const parserServices = context.sourceCode.parserServices as any
			if (parserServices?.defineTemplateBodyVisitor) {
				const templateVisitor: Rule.RuleListener = {
					'VElement': function (node: AnyNode) {
						for (const variable of node.variables ?? []) {
							if (!isConfiguredRoot(variable.id?.name))
								continue
							if (variable.id != null)
								vueTemplateShadowedNodes.add(variable.id)
							for (const reference of variable.references ?? []) {
								if (reference.id != null)
									vueTemplateShadowedNodes.add(reference.id)
							}
						}
					},
					'CallExpression': (node: AnyNode) => inspectCall(node, true),
					'CallExpression:exit': validateCallOnExit,
					'Identifier': (node: AnyNode) => inspectRootUse(node, true),
				}
				return parserServices.defineTemplateBodyVisitor(templateVisitor, scriptVisitor)
			}
			return scriptVisitor
		},
	}
}

/** Create the configured rule that closes over one immutable project model. */
export function createStaticUsageRule(model: LintProjectModel): Rule.RuleModule {
	return createRule(model)
}

export default createStaticUsageRule
