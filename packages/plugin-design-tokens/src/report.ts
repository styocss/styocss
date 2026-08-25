import type { Engine } from '@pikacss/core'

/**
 * A snapshot of design-token usage computed on demand from an engine's current
 * atomic-style store.
 *
 * @remarks Returned by `engine.designTokens.report()`. `used`/`unused` are the
 * registered design-token variable names (every kind, including external
 * aliases) partitioned by whether they are referenced — directly or through a
 * transitive `var()`-in-`var()` chain — by any atomic style. `strictViolations`
 * are cumulative counters of strict-mode diagnostics produced so far,
 * accumulated as diagnostics are reported through the engine's `onDiagnostic`
 * handler.
 */
export interface DesignTokensReport {
	/** Total number of registered design-token variable names (all kinds). */
	totalTokens: number
	/** Registered token variable names referenced by at least one atomic style, sorted. */
	used: string[]
	/** Registered token variable names referenced by no atomic style, sorted. */
	unused: string[]
	/** Deprecated token variable names that are in use, sorted. */
	deprecatedInUse: string[]
	/** Cumulative counts of strict-mode diagnostics produced, by severity. */
	strictViolations: { warning: number, error: number }
}

/**
 * Computes a {@link DesignTokensReport} from the engine's live state.
 *
 * @internal
 *
 * @param engine - The initialized engine; variable usage comes from Core's readonly Variables semantic query.
 * @param tokenVars - Every registered design-token variable name (all kinds).
 * @param deprecatedNames - The deprecated token var-name registry.
 * @param strictViolations - The live cumulative strict-violation counters.
 * @param strictViolations.warning - Cumulative count of warning-level violations.
 * @param strictViolations.error - Cumulative count of error-level violations.
 * @returns The computed report.
 *
 * @remarks Core owns atomic-variable usage discovery and transitive variable-value expansion; this report only partitions its own token registry against that readonly semantic result.
 */
export function computeDesignTokensReport(
	engine: Engine,
	tokenVars: ReadonlySet<string>,
	deprecatedNames: ReadonlySet<string>,
	strictViolations: { warning: number, error: number },
): DesignTokensReport {
	const used = engine.getUsedVariableNames()

	// Partition registered token vars by usage.
	const usedTokens: string[] = []
	const unusedTokens: string[] = []
	for (const v of tokenVars) {
		if (used.has(v))
			usedTokens.push(v)
		else
			unusedTokens.push(v)
	}

	const deprecatedInUse: string[] = []
	for (const v of deprecatedNames) {
		if (used.has(v))
			deprecatedInUse.push(v)
	}

	return {
		totalTokens: tokenVars.size,
		used: usedTokens.sort(),
		unused: unusedTokens.sort(),
		deprecatedInUse: deprecatedInUse.sort(),
		strictViolations: { warning: strictViolations.warning, error: strictViolations.error },
	}
}
