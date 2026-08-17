import type { Engine, Nullish } from '@pikacss/core'
import type { SourceMap } from 'magic-string'
import type { FnConfig } from './fnConfig'
import type { ParsedModuleId } from './moduleId'
import type { AnalyzedModule, ProcessorRegistry } from './processors/types'
import type { UsageRecord } from './types'
import { createHash } from 'node:crypto'
import MagicString from 'magic-string'
import { PikaTransformError } from './compiler/errors'
import { resolveOutputFormat } from './fnConfig'

/**
 * One source-range replacement produced by preparing a module.
 */
export interface Replacement {
	/** Zero-based start offset of the replaced range. */
	start: number
	/** Zero-based end offset of the replaced range (exclusive). */
	end: number
	/** The literal that replaces the original call text. */
	content: string
}

/**
 * The fully prepared (analyzed + engine-resolved) result for one module.
 *
 * @remarks
 * Prepared results are the unit shared between the build-mode full scan and
 * the bundler's own transform pass: when the source hash matches, the pass
 * applies the precomputed replacements without re-analyzing.
 */
export interface PreparedModule {
	/** Normalized absolute file path (`ParsedModuleId.file`). */
	id: string
	/** Hash of the exact source that was analyzed. */
	sourceHash: string
	/** Replacements sorted by start offset. */
	replacements: Replacement[]
	/** Usage records for all calls, in source order. */
	usageList: UsageRecord[]
}

/**
 * Per-module transform state kept across dev-mode rebuilds.
 */
export interface ModuleState {
	/** Monotonic revision; a stale async completion must not overwrite a newer one. */
	revision: number
	/** Last successfully prepared result (kept across failures — last-good). */
	prepared: PreparedModule | null
}

/**
 * Hashes module source for prepared-result reuse.
 *
 * @param code - The module source.
 * @returns A sha1 hex digest of the source.
 */
export function hashSource(code: string): string {
	return createHash('sha1')
		.update(code)
		.digest('hex')
}

// Line terminators must be escaped too: an unresolved string style item is
// echoed back verbatim by the engine and may contain a raw newline, which
// would otherwise split the emitted literal across lines (SyntaxError).
function quoteWith(value: string, quote: '"' | '\'') {
	const escaped = value.replace(/\\/g, '\\\\')
		.replaceAll(quote, `\\${quote}`)
		.replace(/\n/g, '\\n')
		.replace(/\r/g, '\\r')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029')
	return `${quote}${escaped}${quote}`
}

function serializeNames(names: string[], format: 'string' | 'array', quote: '"' | '\'') {
	return format === 'array'
		? `[${names.map(name => quoteWith(name, quote))
			.join(', ')}]`
		: quoteWith(names.join(' '), quote)
}

/**
 * Cheap stable comparison for usage record lists: both lists originate from
 * statically evaluated source literals, so identical source produces an
 * identical serialization. Any serialization failure is treated as "changed".
 *
 * @param previous - The previously committed usage list, if any.
 * @param next - The freshly prepared usage list.
 * @returns Whether both lists serialize identically.
 */
export function isSameUsageList(previous: UsageRecord[] | Nullish, next: UsageRecord[]): boolean {
	const previousList = previous ?? []
	if (previousList.length !== next.length)
		return false
	try {
		return JSON.stringify(previousList) === JSON.stringify(next)
	}
	catch {
		return false
	}
}

/**
 * Dependencies for {@link analyzeModule}.
 */
export interface AnalyzeModuleDeps {
	registry: ProcessorRegistry
	fnConfig: FnConfig
}

/**
 * Stage 1 — pure, engine-free analysis with the source fast filter.
 *
 * @param code - The module source.
 * @param moduleId - The parsed module identity.
 * @param deps - The processor registry and fn config.
 * @returns The analyzed module, or `null` when the fast filter rejects the
 * module (unsupported extension or fn-name substring absent). The fast filter
 * only decides whether to parse — never correctness.
 * @throws {@link PikaTransformError} on any parse/scope/evaluation failure.
 */
export async function analyzeModule(code: string, moduleId: ParsedModuleId, deps: AnalyzeModuleDeps): Promise<AnalyzedModule | null> {
	// The base name is the only variant root,
	// so the substring check cannot produce false negatives.
	if (!deps.registry.has(moduleId.ext) || !code.includes(deps.fnConfig.fnName))
		return null
	const processor = await deps.registry.resolve(moduleId.ext)!
	return processor.analyze(code, moduleId.file, { fnConfig: deps.fnConfig })
}

/**
 * Dependencies for {@link prepareModule}.
 */
export interface PrepareModuleDeps {
	engine: Engine
	transformedFormat: 'string' | 'array'
}

/**
 * Stage 2 — resolves every analyzed call through the engine and builds the
 * prepared module. Calls are resolved sequentially in source-offset order so
 * atomic style ids are minted deterministically. Commits nothing: a failure
 * on any call aborts the whole module with no partial state.
 *
 * @param analyzed - The analyzed module (calls sorted by offset).
 * @param deps - The engine and output format.
 * @returns The prepared module.
 * @throws {@link PikaTransformError} (stage `'prepare'`) when the engine rejects a call.
 */
export async function prepareModule(analyzed: AnalyzedModule, deps: PrepareModuleDeps): Promise<PreparedModule> {
	const replacements: Replacement[] = []
	const usageList: UsageRecord[] = []

	for (const call of analyzed.calls) {
		let names: string[]
		try {
			names = await deps.engine.use(...call.args)
		}
		catch (error: any) {
			throw new PikaTransformError({
				id: analyzed.id,
				stage: 'prepare',
				loc: call.loc,
				message: `Failed to resolve ${call.variant.name}(...) call: ${error?.message ?? error}`,
				cause: error,
			})
		}
		replacements.push({
			start: call.start,
			end: call.end,
			content: serializeNames(names, resolveOutputFormat(call.variant, deps.transformedFormat), call.quote),
		})
		usageList.push({ atomicStyleIds: names })
	}

	return {
		id: analyzed.id,
		sourceHash: hashSource(analyzed.code),
		replacements,
		usageList,
	}
}

/**
 * Dependencies for {@link commitModule}.
 */
export interface CommitModuleDeps {
	usages: Map<string, UsageRecord[]>
	triggerStyleUpdated: () => void
}

/**
 * Stage 3 — atomically swaps the module's usage records into the shared map.
 * The style regeneration hook fires only when the resolved usage records
 * actually differ, so re-saving an unchanged file never forces a CSS
 * regeneration. TypeScript codegen is deliberately NOT triggered here:
 * generated declarations are a projection of the effective project/type
 * configuration and never depend on source usage (#113).
 *
 * @param prepared - The prepared module.
 * @param deps - The usage map and regeneration trigger.
 */
export function commitModule(prepared: PreparedModule, deps: CommitModuleDeps): void {
	const previousUsageList = deps.usages.get(prepared.id)
	const hadUsages = previousUsageList != null

	if (prepared.usageList.length === 0) {
		deps.usages.delete(prepared.id)
		if (hadUsages)
			deps.triggerStyleUpdated()
		return
	}

	deps.usages.set(prepared.id, prepared.usageList)

	const unchanged = hadUsages && isSameUsageList(previousUsageList, prepared.usageList)
	if (!unchanged)
		deps.triggerStyleUpdated()
}

/**
 * Stage 4 — applies the prepared replacements to the module source.
 *
 * @param code - The module source (must match `prepared.sourceHash`).
 * @param prepared - The prepared module.
 * @returns The rewritten code and a high-resolution source map.
 */
export function rewriteModule(code: string, prepared: PreparedModule): { code: string, map: SourceMap } {
	const transformed = new MagicString(code)
	for (const replacement of prepared.replacements)
		transformed.update(replacement.start, replacement.end, replacement.content)
	return {
		code: transformed.toString(),
		map: transformed.generateMap({ hires: true }),
	}
}
