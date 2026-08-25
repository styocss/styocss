/** Managed Typegen attachment points contributed by one plugin. */
export interface TypegenContribution {
	/** Stable contribution identity. Must be non-empty and unique per Engine. */
	readonly id: string
	/** Verbatim supporting TypeScript declarations. */
	readonly declarations?: string
	/** First-level Pika static-extension type roots. */
	readonly pika?: Readonly<Record<string, string>>
	readonly selectors?: string
	readonly properties?: string
	readonly cssProperties?: string
	readonly cssPropertyValues?: string
	readonly propertyConstraints?: string
}

/** Immutable semantic contribution captured in a finalized Typegen snapshot. */
export interface TypegenSnapshotContribution {
	readonly id: string
	readonly declarations?: string
	readonly pika?: Readonly<Record<string, string>>
	readonly selectors?: string
	readonly properties?: string
	readonly cssProperties?: string
	readonly cssPropertyValues?: string
	readonly propertyConstraints?: string
}

/** Path-independent Typegen semantic state produced by Engine finalization. */
export interface TypegenSnapshot {
	readonly contributions: readonly TypegenSnapshotContribution[]
}
