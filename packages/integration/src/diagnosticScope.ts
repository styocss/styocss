import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Host execution context for a diagnostic, kept separate from the semantic
 * `Diagnostic` payload owned by `@pikacss/core`.
 *
 * @remarks
 * `generationId` identifies one bundler build/rebuild generation and is
 * established by the bundler adapter around work it starts for that
 * generation. `moduleId` is the normalized absolute source file the
 * integration is currently analyzing/preparing — established by
 * `@pikacss/integration` itself so integration-owned work (like the
 * production full scan) is attributed too. Project-level work (config
 * evaluation, engine setup) intentionally carries no `moduleId`.
 */
export interface DiagnosticScope {
	/** The bundler build generation the current work was started for, if any. */
	generationId?: number
	/** Normalized absolute path of the module currently being processed, if any. */
	moduleId?: string
}

// Node async-context storage: scopes survive `await` boundaries, so
// concurrent transforms each read their own attribution instead of a shared
// mutable variable. This deliberately lives in the Node-oriented integration
// layer — core stays platform-neutral and bundler-agnostic.
const storage = new AsyncLocalStorage<DiagnosticScope>()

/**
 * Runs `fn` with the given diagnostic scope fields merged over the current
 * scope, for the full async duration of `fn`.
 *
 * @param scope - Scope fields to establish; unset fields inherit from the enclosing scope.
 * @param fn - The work whose diagnostics should carry this scope.
 * @returns The return value of `fn`.
 *
 * @remarks
 * Nesting merges naturally: a bundler adapter establishes `generationId`
 * around build work, the integration establishes `moduleId` around
 * per-module work, and a diagnostic handler reads both.
 */
export function runWithDiagnosticScope<T>(scope: DiagnosticScope, fn: () => T): T {
	const parent = storage.getStore()
	return storage.run({ ...parent, ...scope }, fn)
}

/**
 * Reads the diagnostic scope of the currently executing async context.
 *
 * @returns The active scope, or an empty object outside any scope.
 */
export function getDiagnosticScope(): DiagnosticScope {
	return storage.getStore() ?? {}
}
