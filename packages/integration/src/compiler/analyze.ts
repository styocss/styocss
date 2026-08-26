import type { FnConfig } from '../fnConfig'
import type { MacroCall } from '../processors/types'
import type { JsDialect, ParseOffsets } from './parse'
import * as t from '@babel/types'
import { collectMacroCallsForRoots } from './collect'
import { PikaTransformError } from './errors'
import { parseJs, parseJsExpression } from './parse'
import { STATIC_GLOBAL_NAMES } from './staticGlobals'

export interface AnalyzeJsOptions {
	offsets?: ParseOffsets
	quote?: '"' | '\''
	parseMode?: 'program' | 'expression'
	excludedRoots?: ReadonlySet<string>
}

function parseAnalyzedAst(code: string, id: string, dialect: JsDialect, options?: AnalyzeJsOptions): t.File {
	try {
		return options?.parseMode === 'expression'
			? t.file(t.program([t.expressionStatement(parseJsExpression(code, dialect, options?.offsets))]))
			: parseJs(code, dialect, options?.offsets)
	}
	catch (error: any) {
		throw new PikaTransformError({
			id,
			stage: 'parse',
			loc: error?.loc == null ? null : { line: error.loc.line, column: error.loc.column },
			message: `Failed to parse module: ${error?.message ?? error}`,
			cause: error,
		})
	}
}

function toMacroCall(
	node: t.CallExpression,
	path: import('@babel/traverse').NodePath<t.CallExpression>,
	quote: '"' | '\'',
): MacroCall {
	return {
		start: node.start!,
		end: node.end!,
		loc: { line: node.loc!.start.line, column: node.loc!.start.column },
		arguments: node.arguments,
		lexical: {
			shadowedGlobals: new Set(STATIC_GLOBAL_NAMES.filter(name => path.scope.getBinding(name) != null)),
		},
		quote,
	}
}

/** Parses once and classifies all configured project roots in one traversal. */
export function analyzeJsProject(
	code: string,
	id: string,
	dialect: JsDialect,
	fnNames: readonly string[],
	options?: AnalyzeJsOptions,
): ReadonlyMap<string, readonly MacroCall[]> {
	const ast = parseAnalyzedAst(code, id, dialect, options)
	const quote = options?.quote ?? '\''
	const callsByRoot = new Map<string, MacroCall[]>(fnNames.map(fnName => [fnName, []]))
	const collected = collectMacroCallsForRoots(ast, fnNames, { id, excludedRoots: options?.excludedRoots })
		.sort((a, b) => a.node.start! - b.node.start!)
	for (const { fnName, node, path } of collected)
		callsByRoot.get(fnName)!.push(toMacroCall(node, path, quote))
	return callsByRoot
}

/**
 * Parses and analyzes one JS/TS source chunk without evaluating Pika arguments.
 * Analyze is pure/Engine-free; bounded static grammar/evaluation belongs to Prepare.
 */
export function analyzeJs(
	code: string,
	id: string,
	dialect: JsDialect,
	fnConfig: FnConfig,
	options?: AnalyzeJsOptions,
): MacroCall[] {
	return [...analyzeJsProject(code, id, dialect, [fnConfig.fnName], options)
		.get(fnConfig.fnName)!]
}
