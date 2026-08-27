import type { FnConfig } from '../fnConfig'
import type { MacroCall } from '../processors/types'
import type { JsDialect, ParseOffsets } from './parse'
import * as t from '@babel/types'
import { collectMacroCalls } from './collect'
import { PikaTransformError } from './errors'
import { parseJs, parseJsExpression } from './parse'
import { STATIC_GLOBAL_NAMES } from './staticGlobals'

export interface AnalyzeJsOptions {
	offsets?: ParseOffsets
	quote?: '"' | '\''
	parseMode?: 'program' | 'expression'
	excludedRoots?: ReadonlySet<string>
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
	let ast: t.File
	try {
		ast = options?.parseMode === 'expression'
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

	const collected = collectMacroCalls(ast, fnConfig, { id, excludedRoots: options?.excludedRoots })
		.sort((a, b) => a.node.start! - b.node.start!)
	const quote = options?.quote ?? '\''
	return collected.map(({ node, path }): MacroCall => ({
		start: node.start!,
		end: node.end!,
		loc: { line: node.loc!.start.line, column: node.loc!.start.column },
		arguments: node.arguments,
		lexical: {
			shadowedGlobals: new Set(STATIC_GLOBAL_NAMES.filter(name => path.scope.getBinding(name) != null)),
		},
		quote,
	}))
}
