/**
 * Pipeline stage in which a transform failure occurred.
 *
 * - `'parse'` — source (or an embedded expression) failed to parse.
 * - `'collect'` — the macro-call collector rejected a call site.
 * - `'evaluate'` — a call argument is not statically evaluable.
 * - `'prepare'` — resolving a call through the engine failed.
 */
export type TransformErrorStage = 'parse' | 'collect' | 'evaluate' | 'prepare'

/**
 * One-based source position of a transform failure.
 */
export interface TransformErrorLoc {
	/** One-based line number of the failure. */
	line: number
	/** Zero-based column of the failure (Babel convention). */
	column: number
}

/**
 * Extracts a {@link TransformErrorLoc} from an AST node's source location.
 *
 * @param node - Any node carrying an optional Babel-style `loc`.
 * @param node.loc - The Babel-style source location, when present.
 * @returns The start position, or `null` when the node has no location info.
 */
export function nodeLoc(node: { loc?: { start: { line: number, column: number } } | null }): TransformErrorLoc | null {
	return node.loc == null ? null : { line: node.loc.start.line, column: node.loc.start.column }
}

/**
 * Error thrown when a module cannot be transformed.
 *
 * @remarks
 * Module transforms are atomic: any failure aborts the whole module without
 * committing partial results, and this error propagates to the bundler (dev
 * overlay / failed build). The `id` and `loc` fields follow the shape bundlers
 * (Vite/Rollup) read to render code frames for plugin errors.
 */
export class PikaTransformError extends Error {
	/** Normalized absolute path of the failing module. */
	readonly id: string
	/** One-based position of the failure inside the module, when known. */
	readonly loc: TransformErrorLoc | null
	/** Pipeline stage that failed. */
	readonly stage: TransformErrorStage

	constructor(options: {
		id: string
		stage: TransformErrorStage
		message: string
		loc?: TransformErrorLoc | null
		cause?: unknown
	}) {
		const position = options.loc == null ? '' : `:${options.loc.line}:${options.loc.column}`
		super(`[pikacss] ${options.message} (${options.id}${position})`, { cause: options.cause })
		this.name = 'PikaTransformError'
		this.id = options.id
		this.loc = options.loc ?? null
		this.stage = options.stage
	}
}

/**
 * Error thrown when a transform completes its provisional work but has been
 * superseded by a newer revision of the same module (or a newer engine epoch)
 * before reaching the commit boundary.
 *
 * @remarks
 * A superseded attempt consumes zero committed IDs/engine state (#114), so it
 * cannot produce transformed output — and it must not be reported as a
 * successful no-op either: at the bundler boundary a `null` transform result
 * means "serve the original source", which would let an unexpanded compile-time
 * `pika()` macro reach the runtime (the bundler can still hand a stale
 * transform result to its original caller even after invalidating the module).
 * Failing the stale request loudly is safe and self-healing: the request that
 * matters targets the newer content and is served by the newer transform.
 */
export class PikaStaleTransformError extends Error {
	/** Normalized absolute path of the superseded module. */
	readonly id: string

	constructor(options: { id: string }) {
		super(`[pikacss] Transform of ${options.id} was superseded by a newer revision; retrying serves the newer result`)
		this.name = 'PikaStaleTransformError'
		this.id = options.id
	}
}
