import type { TypegenContribution, TypegenSnapshot, TypegenSnapshotContribution } from './snapshot'

export type { TypegenContribution, TypegenSnapshot, TypegenSnapshotContribution } from './snapshot'

/** Read-side engine-scoped Typegen manager. */
export interface TypegenManager {
	/** Finalized immutable semantic snapshot. */
	readonly snapshot: TypegenSnapshot
}

/** Owner-bound initialization capability exposed only through one plugin context. */
export interface TypegenRegistrationCapability {
	/** Registers one contribution during this plugin's active configureEngine hook. */
	add: (contribution: TypegenContribution) => void
}

interface OwnedContribution {
	owner: object
	value: TypegenSnapshotContribution
}

interface TypegenManagerState {
	contributions: OwnedContribution[]
	ids: Set<string>
	pikaOwners: Map<string, object>
	finalized: boolean
	snapshot?: TypegenSnapshot
}

interface RegistrationGate {
	open: boolean
}

export interface TypegenRegistrationController {
	readonly capability: TypegenRegistrationCapability
	open: () => void
	close: () => void
}

const states = new WeakMap<TypegenManager, TypegenManagerState>()

function freezeContribution(contribution: TypegenContribution): TypegenSnapshotContribution {
	const result: TypegenSnapshotContribution = {
		id: contribution.id,
		...(contribution.declarations === undefined ? {} : { declarations: contribution.declarations }),
		...(contribution.pika === undefined ? {} : { pika: Object.freeze({ ...contribution.pika }) }),
		...(contribution.selectors === undefined ? {} : { selectors: contribution.selectors }),
		...(contribution.properties === undefined ? {} : { properties: contribution.properties }),
		...(contribution.cssProperties === undefined ? {} : { cssProperties: contribution.cssProperties }),
		...(contribution.cssPropertyValues === undefined ? {} : { cssPropertyValues: contribution.cssPropertyValues }),
		...(contribution.propertyConstraints === undefined ? {} : { propertyConstraints: contribution.propertyConstraints }),
	}
	return Object.freeze(result)
}

/** @internal */
export function createTypegenManager(): TypegenManager {
	const manager: TypegenManager = {
		get snapshot() {
			const snapshot = states.get(manager)!.snapshot
			if (snapshot == null)
				throw new Error('Typegen snapshot is not available until Engine finalization')
			return snapshot
		},
	}
	states.set(manager, {
		contributions: [],
		ids: new Set(),
		pikaOwners: new Map(),
		finalized: false,
	})
	return manager
}

/** @internal */
export function createTypegenRegistrationController(manager: TypegenManager, owner: object): TypegenRegistrationController {
	const gate: RegistrationGate = { open: false }
	const capability: TypegenRegistrationCapability = Object.freeze({
		add(contribution: TypegenContribution) {
			const state = states.get(manager)!
			if (state.finalized)
				throw new Error('Typegen contributions are finalized and cannot be modified')
			if (!gate.open)
				throw new Error('Typegen contributions may only be registered during this plugin configureEngine hook')
			if (typeof contribution.id !== 'string' || contribution.id.trim().length === 0)
				throw new Error('Typegen contribution id must be a non-empty string')
			if (state.ids.has(contribution.id))
				throw new Error(`Typegen contribution id "${contribution.id}" is already registered`)

			for (const root of Object.keys(contribution.pika ?? {})) {
				if (root.trim().length === 0)
					throw new Error('Typegen Pika root must be a non-empty string')
				if (state.pikaOwners.has(root))
					throw new Error(`Typegen Pika root "${root}" is already registered`)
			}

			const value = freezeContribution(contribution)
			state.ids.add(value.id)
			for (const root of Object.keys(value.pika ?? {}))
				state.pikaOwners.set(root, owner)
			state.contributions.push({ owner, value })
		},
	})
	return {
		capability,
		open: () => { gate.open = true },
		close: () => { gate.open = false },
	}
}

/** @internal */
export function validateTypegenPikaOwners(
	manager: TypegenManager,
	getRuntimeOwner: (root: string) => object | undefined,
): void {
	const state = states.get(manager)!
	for (const [root, typegenOwner] of state.pikaOwners) {
		const runtimeOwner = getRuntimeOwner(root)
		if (runtimeOwner != null && runtimeOwner !== typegenOwner)
			throw new Error(`Pika root "${root}" has different runtime and Typegen owners`)
	}
}

/** @internal */
export function finalizeTypegenManager(manager: TypegenManager): void {
	const state = states.get(manager)!
	const contributions = Object.freeze(state.contributions.map(({ value }) => value))
	state.snapshot = Object.freeze({ contributions })
	state.finalized = true
	Object.freeze(manager)
}
