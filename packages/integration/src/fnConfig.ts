/**
 * Compiler configuration derived from the reserved Pika function identifier.
 *
 * @remarks v1 has exactly one transform-call form: the configured base
 * identifier itself. Static authoring extensions are value sources inside that
 * base call's accepted argument tree, not callable output-format variants.
 */
export interface FnConfig {
	/** The configured reserved compile-time identifier (e.g. `'pika'`). */
	readonly fnName: string
	/** Root identifiers recognized by framework shadowing logic. */
	readonly roots: ReadonlySet<string>
}

/**
 * Builds compiler configuration for one reserved Pika function identifier.
 *
 * @param fnName - The identifier to recognize as the compile-time root.
 * @returns Compiler configuration containing the identifier and its root set.
 */
export function createFnConfig(fnName: string): FnConfig {
	return {
		fnName,
		roots: new Set([fnName]),
	}
}
