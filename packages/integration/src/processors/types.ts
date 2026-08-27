import type * as t from '@babel/types'
import type { FnConfig } from '../fnConfig'

/** Immutable lexical facts needed by prepare-time bounded static evaluation. */
export interface MacroLexicalFacts {
	/** Recognized static globals shadowed at this base-call site. */
	readonly shadowedGlobals: ReadonlySet<string>
}

/**
 * One analyzed base `pika()` transform call.
 *
 * @remarks Analyze retains Babel argument AST directly plus immutable lexical
 * facts. It does not evaluate arguments and never carries `NodePath`, Scope, or
 * traversal context across the Analyze → Prepare boundary.
 */
export interface MacroCall {
	/** Zero-based character offset where the base call begins. */
	readonly start: number
	/** Zero-based character offset one past the base call's closing parenthesis. */
	readonly end: number
	/** One-based source position of the base call, for diagnostics. */
	readonly loc: { line: number, column: number }
	/** Retained readonly Babel argument nodes; evaluated only during Prepare. */
	readonly arguments: Readonly<t.CallExpression['arguments']>
	/** Minimal immutable scope facts required by the bounded evaluator. */
	readonly lexical: MacroLexicalFacts
	/** Quote character for the emitted literal at this site. */
	readonly quote: '"' | '\''
}

/** Result of analyzing one module. */
export interface AnalyzedModule {
	/** Reserved compile-time root used to classify/evaluate retained argument AST. */
	readonly fnName: string
	readonly id: string
	readonly code: string
	readonly calls: readonly MacroCall[]
}

/** Options handed to a processor's `analyze`. */
export interface ProcessorOptions {
	readonly fnConfig: FnConfig
}

/** Framework-specific source analyzer. Processors analyze only; rewriting is centralized. */
export interface FrameworkProcessor {
	readonly name: string
	analyze: (code: string, id: string, options: ProcessorOptions) => Promise<AnalyzedModule> | AnalyzedModule
}

export type ProcessorLoader = () => Promise<FrameworkProcessor>

export interface ProcessorRegistry {
	register: (extensions: string[], loader: ProcessorLoader) => void
	resolve: (ext: string) => Promise<FrameworkProcessor> | null
	has: (ext: string) => boolean
}
