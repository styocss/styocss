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
	/** Source identifier used for diagnostics and subsequent rewriting. */
	readonly id: string
	/** Original source text from which the calls were collected. */
	readonly code: string
	/** Recognized calls for `fnName`, ordered by their source offset. */
	readonly calls: readonly MacroCall[]
}

/** Options handed to a processor's `analyze`. */
export interface ProcessorOptions {
	/** Reserved-root configuration used by the processor's analysis pass. */
	readonly fnConfig: FnConfig
}

/** One physical-source analysis grouped by configured project root. */
export interface AnalyzedProjectModule {
	/** Source identifier used for diagnostics and subsequent rewriting. */
	readonly id: string
	/** Original physical source text analyzed for all configured roots. */
	readonly code: string
	/** Analyzed modules keyed by their configured reserved-root name. */
	readonly modules: ReadonlyMap<string, AnalyzedModule>
}

/** Options handed to a processor's optional project-level analyzer. */
export interface ProcessorProjectOptions {
	/** Reserved-root names to analyze in one physical-source pass. */
	readonly fnNames: readonly string[]
}

/** Framework-specific source analyzer. Processors analyze only; rewriting is centralized. */
export interface FrameworkProcessor {
	/** Stable processor identifier used when selecting and diagnosing a processor. */
	readonly name: string
	/**
	 * Analyzes one source module without rewriting its source.
	 *
	 * @param code - The source text to analyze.
	 * @param id - The source identifier used for diagnostics and result metadata.
	 * @param options - The configured reserved-root analysis options.
	 * @returns The analyzed module, synchronously or through a promise.
	 */
	analyze: (code: string, id: string, options: ProcessorOptions) => Promise<AnalyzedModule> | AnalyzedModule
	/** Optional single-parse/traverse project analyzer; legacy/custom processors may omit it. */
	analyzeProject?: (
		code: string,
		id: string,
		options: ProcessorProjectOptions,
	) => Promise<AnalyzedProjectModule> | AnalyzedProjectModule
}

/** Lazily loads a framework processor for a registered file-extension group. */
export type ProcessorLoader = () => Promise<FrameworkProcessor>

/** Registry of framework processors keyed by normalized file extension. */
export interface ProcessorRegistry {
	/**
	 * Registers a loader for one or more extensions, replacing prior loaders for those keys.
	 *
	 * @param extensions - File extensions with or without a leading dot.
	 * @param loader - Lazy processor loader to associate with the extensions.
	 */
	register: (extensions: string[], loader: ProcessorLoader) => void
	/**
	 * Resolves a registered extension to its lazily loaded processor.
	 *
	 * @param ext - File extension with or without a leading dot.
	 * @returns The shared loading promise, or `null` when no loader is registered.
	 */
	resolve: (ext: string) => Promise<FrameworkProcessor> | null
	/**
	 * Checks whether an extension has a registered processor loader.
	 *
	 * @param ext - File extension with or without a leading dot.
	 * @returns `true` when the normalized extension is registered.
	 */
	has: (ext: string) => boolean
}
