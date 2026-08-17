import type { Engine, Nullish, StyleUsePlan } from '@pikacss/core'
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
 * One provisionally resolved `pika()` call: the engine plan plus everything
 * needed to serialize the replacement once IDs exist at commit time.
 */
export interface PreparedCall {
	/** The provisional engine plan; carries no atomic style IDs (#114). */
	plan: StyleUsePlan
	/** Zero-based start offset of the original call text. */
	start: number
	/** Zero-based end offset of the original call text (exclusive). */
	end: number
	/** Output format resolved from the call variant at prepare time. */
	format: 'string' | 'array'
	/** Quote style of the surrounding source context. */
	quote: '"' | '\''
}

/**
 * The provisionally prepared result for one module: every call resolved
 * through `engine.prepareUse()`, none committed.
 *
 * @remarks
 * Preparing consumes zero committed engine state — discarding a prepared
 * module (failure, stale revision, engine swap) leaves the engine exactly as
 * it was. Atomic style IDs, replacements, and usage records only exist after
 * `commitModule()` (#114).
 */
export interface PreparedModule {
	/** Normalized absolute file path (`ParsedModuleId.file`). */
	id: string
	/** Hash of the exact source that was analyzed. */
	sourceHash: string
	/** Provisionally resolved calls in source-offset order. */
	preparedCalls: PreparedCall[]
}

/**
 * The committed result for one module — the unit shared between the
 * build-mode full scan and the bundler's own transform pass: when the source
 * hash matches, the pass applies the precomputed replacements without
 * re-analyzing or re-committing engine state.
 */
export interface CommittedModule {
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
	/** Last successfully committed result (kept across failures — last-good). */
	committed: CommittedModule | null
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
		// Deliberately defensive: today's UsageRecord holds only string ids and
		// cannot fail serialization, but a future record field must degrade to
		// "changed" (regenerate) rather than throw out of the commit path.
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
 * Stage 2 — provisionally resolves every analyzed call through
 * `engine.prepareUse()`. Commits nothing: no atomic style IDs are allocated,
 * no engine store state is mutated, and no committed notifications fire, so a
 * failure on any call (or discarding the result) leaves the engine exactly as
 * it was — the whole module is one transaction (#114).
 *
 * @param analyzed - The analyzed module (calls sorted by offset).
 * @param deps - The engine and output format.
 * @returns The prepared module.
 * @throws {@link PikaTransformError} (stage `'prepare'`) when the engine rejects a call.
 */
export async function prepareModule(analyzed: AnalyzedModule, deps: PrepareModuleDeps): Promise<PreparedModule> {
	const preparedCalls: PreparedCall[] = []

	for (const call of analyzed.calls) {
		let plan: StyleUsePlan
		try {
			plan = await deps.engine.prepareUse(...call.args)
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
		preparedCalls.push({
			plan,
			start: call.start,
			end: call.end,
			format: resolveOutputFormat(call.variant, deps.transformedFormat),
			quote: call.quote,
		})
	}

	return {
		id: analyzed.id,
		sourceHash: hashSource(analyzed.code),
		preparedCalls,
	}
}

/**
 * Dependencies for {@link commitModule}.
 */
export interface CommitModuleDeps extends RecommitModuleDeps {
	engine: Engine
}

/**
 * Dependencies for {@link recommitModule}.
 */
export interface RecommitModuleDeps {
	usages: Map<string, UsageRecord[]>
	triggerStyleUpdated: () => void
}

/**
 * Stage 3 — the short, mutation-critical commit for a whole module: allocates
 * or reuses atomic style IDs for every prepared call via `engine.commitUse()`,
 * builds the replacements and usage records from the returned IDs, and swaps
 * the usage records into the shared map.
 *
 * @param prepared - The prepared module (every call provisionally resolved).
 * @param deps - The engine, usage map, and regeneration trigger.
 * @returns The committed module.
 *
 * @remarks
 * Deliberately synchronous with no awaits: callers run it inside a
 * revision/epoch-checked synchronous section, so staleness is decided
 * immediately before mutation with no interleaving window (#114). Commit order
 * across modules determines atomic ID order — build mode commits in canonical
 * sorted order for deterministic IDs.
 */
export function commitModule(prepared: PreparedModule, deps: CommitModuleDeps): CommittedModule {
	const replacements: Replacement[] = []
	const usageList: UsageRecord[] = []
	for (const call of prepared.preparedCalls) {
		const names = deps.engine.commitUse(call.plan)
		replacements.push({
			start: call.start,
			end: call.end,
			content: serializeNames(names, call.format, call.quote),
		})
		usageList.push({ atomicStyleIds: names })
	}
	const committed: CommittedModule = {
		id: prepared.id,
		sourceHash: prepared.sourceHash,
		replacements,
		usageList,
	}
	recommitModule(committed, deps)
	return committed
}

/**
 * Atomically swaps an already-committed module's usage records into the
 * shared map — the cached fast path for re-saves and the build double-pass.
 * The style regeneration hook fires only when the resolved usage records
 * actually differ, so re-saving an unchanged file never forces a CSS
 * regeneration. TypeScript codegen is deliberately NOT triggered here:
 * generated declarations are a projection of the effective project/type
 * configuration and never depend on source usage (#113).
 *
 * @param committed - The committed module.
 * @param deps - The usage map and regeneration trigger.
 */
export function recommitModule(committed: CommittedModule, deps: RecommitModuleDeps): void {
	const previousUsageList = deps.usages.get(committed.id)
	const hadUsages = previousUsageList != null

	if (committed.usageList.length === 0) {
		deps.usages.delete(committed.id)
		if (hadUsages)
			deps.triggerStyleUpdated()
		return
	}

	deps.usages.set(committed.id, committed.usageList)

	const unchanged = hadUsages && isSameUsageList(previousUsageList, committed.usageList)
	if (!unchanged)
		deps.triggerStyleUpdated()
}

/**
 * Stage 4 — applies the committed replacements to the module source.
 *
 * @param code - The module source (must match `committed.sourceHash`).
 * @param committed - The committed module.
 * @returns The rewritten code and a high-resolution source map.
 */
export function rewriteModule(code: string, committed: CommittedModule): { code: string, map: SourceMap } {
	const transformed = new MagicString(code)
	for (const replacement of committed.replacements)
		transformed.update(replacement.start, replacement.end, replacement.content)
	return {
		code: transformed.toString(),
		map: transformed.generateMap({ hires: true }),
	}
}
