import type { Rule, Scope } from 'eslint'
import { evaluateObjectKey, evaluateStatic, getDynamicReason, isShadowedByDeclaration, unwrap } from '../static-evaluate'
import { buildFnNamePatterns, getCalleeName, getCalleeRootName } from '../utils/fn-names'

function reportDynamicNode(
	context: Rule.RuleContext,
	node: any,
	messageId: 'noDynamicArg' | 'noDynamicProperty' | 'noDynamicSpread' | 'noDynamicComputedKey',
	fnName: string,
	reason?: string,
) {
	context.report({
		node,
		messageId,
		data: reason == null ? { fnName } : { fnName, reason },
	})
}

/**
 * ESLint rule that disallows dynamic arguments in PikaCSS function calls.
 *
 * Every argument passed to the configured PikaCSS callee (and its `.str`
 * and `.arr` variants) must be evaluable by the same value-aware
 * static evaluator the build-time compiler uses: literals, recursively-static
 * objects and arrays, template literals whose interpolations evaluate to
 * primitives, the compiler's unary/binary/logical/conditional operators with
 * the compiler's short-circuit and operand-type rules, and the global
 * constants `undefined`/`NaN`/`Infinity` when not shadowed by a real
 * declaration. The rule mirrors the compiler exactly: dead operands of
 * short-circuited logical/conditional expressions may be dynamic, while
 * type-invalid static forms the compiler hard-errors on (e.g. `null + null`,
 * `` `x-${{ a: 1 }}` ``, spreads of wrong-shaped values, non-string/number
 * computed keys) are reported even though they are shape-static.
 *
 * Calls whose callee root is a binding with a real declaration site (import,
 * variable, parameter, function/class) are skipped — they are the user's own
 * function, not a macro, matching the transformer's scope-based shadowing.
 * Ambient/configured ESLint globals (`languageOptions.globals`) do not count
 * as declarations: the transformer rewrites those calls, so the rule keeps
 * checking them.
 *
 * Reports four distinct message IDs depending on violation location:
 * `noDynamicArg`, `noDynamicProperty`, `noDynamicSpread`, and
 * `noDynamicComputedKey`.
 *
 * When `vue-eslint-parser` is active, the rule also inspects `<template>`
 * call expressions via `defineTemplateBodyVisitor`.
 *
 * @internal
 */
const rule: Rule.RuleModule = {
	meta: {
		type: 'problem',
		docs: {
			description: 'Disallow dynamic arguments in PikaCSS calls when enforcing the predictable static subset recommended for build-time transforms.',
			url: 'https://github.com/pikacss/pikacss/blob/main/packages/eslint-config/docs/rules/no-dynamic-args.md',
		},
		messages: {
			noDynamicArg: 'PikaCSS static-subset violation: {{ reason }}. All arguments to {{ fnName }}() must stay within the predictable literal subset enforced by this rule.',
			noDynamicProperty: 'PikaCSS static-subset violation: {{ reason }}. All property values in {{ fnName }}() arguments must stay within the predictable literal subset enforced by this rule.',
			noDynamicSpread: 'PikaCSS static-subset violation: Spread of dynamic value is not allowed in {{ fnName }}() arguments. Only spreads of static arrays (in arrays and call arguments) or static objects (in object literals) are permitted.',
			noDynamicComputedKey: 'PikaCSS static-subset violation: Computed property key {{ reason }}. Only static string or number computed keys are allowed in {{ fnName }}() arguments.',
		},
		schema: [
			{
				type: 'object',
				properties: {
					fnName: {
						type: 'string',
						description: 'The base function name to detect. Defaults to \'pika\'. Dot access and static bracket-access variants are derived automatically.',
					},
				},
				additionalProperties: false,
			},
		],
		defaultOptions: [{ fnName: 'pika' }],
	},
	create(context) {
		const options = context.options[0] as { fnName?: string } | undefined
		const { allNames } = buildFnNamePatterns(options?.fnName)

		function validateObjectExpression(argNode: any, fnName: string, scope: Scope.Scope | null | undefined): void {
			for (const prop of argNode.properties) {
				if (prop.type === 'SpreadElement') {
					const spread = evaluateStatic(prop.argument, scope)
					if (!spread.ok || spread.value == null || typeof spread.value !== 'object' || Array.isArray(spread.value))
						reportDynamicNode(context, prop, 'noDynamicSpread', fnName)
					continue
				}

				if (prop.type !== 'Property') {
					reportDynamicNode(context, prop, 'noDynamicProperty', fnName, getDynamicReason(prop))
					continue
				}

				const key = evaluateObjectKey(prop, scope)
				if (!key.ok) {
					if (prop.computed) {
						reportDynamicNode(context, key.node, 'noDynamicComputedKey', fnName, key.reason)
					}
					else {
						reportDynamicNode(context, key.node, 'noDynamicProperty', fnName, key.reason)
					}
				}

				const value = evaluateStatic(prop.value, scope)
				if (!value.ok) {
					const unwrapped = unwrap(prop.value)
					if (unwrapped?.type === 'ObjectExpression' || unwrapped?.type === 'ArrayExpression') {
						validateArg(prop.value, fnName, scope)
					}
					else {
						reportDynamicNode(context, value.node ?? prop.value ?? prop, 'noDynamicProperty', fnName, value.node == null ? getDynamicReason(prop) : value.reason)
					}
				}
			}
		}

		function validateArrayExpression(argNode: any, fnName: string, scope: Scope.Scope | null | undefined): void {
			for (const el of argNode.elements) {
				if (el === null)
					continue
				if (el.type === 'SpreadElement') {
					const spread = evaluateStatic(el.argument, scope)
					if (!spread.ok || !Array.isArray(spread.value))
						reportDynamicNode(context, el, 'noDynamicSpread', fnName)
					continue
				}
				const value = evaluateStatic(el, scope)
				if (!value.ok) {
					const unwrapped = unwrap(el)
					if (unwrapped?.type === 'ObjectExpression' || unwrapped?.type === 'ArrayExpression') {
						validateArg(el, fnName, scope)
					}
					else {
						reportDynamicNode(context, value.node ?? el, 'noDynamicArg', fnName, value.node == null ? getDynamicReason(el) : value.reason)
					}
				}
			}
		}

		/**
		 * Report non-static nodes within a pika() argument, with specific
		 * messages depending on the position (top-level arg, property value,
		 * spread, computed key). Objects and arrays are descended into so
		 * every offending inner node gets its own report.
		 */
		function validateArg(argNode: any, fnName: string, scope: Scope.Scope | null | undefined): void {
			const result = evaluateStatic(argNode, scope)
			if (result.ok)
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

		function checkCallExpression(node: any): void {
			const calleeName = getCalleeName(node)
			if (calleeName === null || !allNames.has(calleeName))
				return

			// Skip when the callee root is a binding with a real declaration site
			// (import, variable, parameter, function/class): it is the user's own
			// function, not a PikaCSS macro. Ambient/configured ESLint globals
			// (e.g. `languageOptions.globals: { pika: 'readonly' }`) do NOT count:
			// the transformer still rewrites such calls, so the rule must keep
			// checking them. Mirrors the transformer's Babel-scope shadowing so the
			// rule never flags calls the compiler would leave untouched.
			const scope = context.sourceCode.getScope?.(node)
			const rootName = getCalleeRootName(node)
			if (rootName != null && isShadowedByDeclaration(rootName, scope))
				return

			// Derive the displayed function name (just the base, e.g. 'pika' or 'pika.str')
			const displayFnName = calleeName

			for (const arg of node.arguments) {
				if (arg.type === 'SpreadElement') {
					// Call-level spread must evaluate to an array (the compiler
					// hard-errors on 'call spread of a non-array value').
					const spread = evaluateStatic(arg.argument, scope)
					if (!spread.ok || !Array.isArray(spread.value))
						reportDynamicNode(context, arg, 'noDynamicSpread', displayFnName)
					continue
				}
				validateArg(arg, displayFnName, scope)
			}
		}

		// If vue-eslint-parser is active, also register the visitor for <template>
		const parserServices = context.sourceCode.parserServices as any
		if (parserServices?.defineTemplateBodyVisitor) {
			return parserServices.defineTemplateBodyVisitor(
				{ CallExpression: checkCallExpression },
				{ CallExpression: checkCallExpression },
			)
		}

		return { CallExpression: checkCallExpression }
	},
}

export default rule
