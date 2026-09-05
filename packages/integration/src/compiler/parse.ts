import type { ParserOptions, ParserPlugin } from '@babel/parser'
import type * as t from '@babel/types'
import { parse, parseExpression } from '@babel/parser'

/**
 * JavaScript dialect a source chunk is parsed as.
 *
 * @remarks
 * `.ts` sources must NOT enable the `jsx` plugin: TypeScript angle-bracket
 * casts (`<T>expr`) are only parseable without it. `.tsx` enables both.
 */
export type JsDialect = 'js' | 'jsx' | 'ts' | 'tsx'

const BASE_PLUGINS: ParserPlugin[] = [
	'decorators',
]

const DIALECT_PLUGINS: Record<JsDialect, ParserPlugin[]> = {
	// Tolerate JSX in plain .js files (common in older React ecosystems);
	// the jsx plugin is harmless for JSX-free JavaScript.
	js: ['jsx', ...BASE_PLUGINS],
	jsx: ['jsx', ...BASE_PLUGINS],
	ts: ['typescript', ...BASE_PLUGINS],
	tsx: ['typescript', 'jsx', ...BASE_PLUGINS],
}

/**
 * Position offsets applied to all emitted node positions, used when parsing an
 * embedded source chunk (e.g. a Vue SFC block) so node offsets/locations are
 * absolute into the surrounding file.
 */
export interface ParseOffsets {
	/** Zero-based character offset of the chunk inside the surrounding file. */
	startIndex?: number
	/** One-based line of the chunk's first character. */
	startLine?: number
	/** Zero-based column of the chunk's first character. */
	startColumn?: number
}

function buildOptions(dialect: JsDialect, offsets?: ParseOffsets): ParserOptions {
	return {
		sourceType: 'unambiguous',
		plugins: DIALECT_PLUGINS[dialect],
		attachComment: false,
		...offsets?.startIndex == null ? {} : { startIndex: offsets.startIndex },
		...offsets?.startLine == null ? {} : { startLine: offsets.startLine },
		...offsets?.startColumn == null ? {} : { startColumn: offsets.startColumn },
	}
}

/**
 * Parses a JavaScript/TypeScript source file into a Babel AST.
 *
 * @param code - The source chunk to parse.
 * @param dialect - The {@link JsDialect} deciding the parser plugin set.
 * @param offsets - Optional {@link ParseOffsets} making emitted positions absolute into a surrounding file.
 * @returns The parsed `File` node.
 * @throws The raw Babel `SyntaxError` (carrying `loc`) on invalid syntax; callers wrap it into `PikaTransformError`.
 */
export function parseJs(code: string, dialect: JsDialect, offsets?: ParseOffsets): t.File {
	return parse(code, buildOptions(dialect, offsets))
}

/**
 * Parses a bare JavaScript/TypeScript expression (e.g. a Vue template expression) into a Babel AST node.
 *
 * @param code - The expression source.
 * @param dialect - The {@link JsDialect} deciding the parser plugin set.
 * @param offsets - Optional {@link ParseOffsets} making emitted positions absolute into a surrounding file.
 * @returns The parsed expression node.
 * @throws The raw Babel `SyntaxError` (carrying `loc`) on invalid syntax; callers wrap it into `PikaTransformError`.
 */
export function parseJsExpression(code: string, dialect: JsDialect, offsets?: ParseOffsets): t.Expression {
	return parseExpression(code, buildOptions(dialect, offsets))
}
