/** Read-side engine-scoped registry for first-level Pika static authoring extensions. */
export interface PikaManager {
	/** Returns the finalized implementation for a first-level static root. */
	getStatic: (name: string) => unknown | undefined
}

/** Owner-bound initialization capability exposed only through one plugin context. */
export interface PikaRegistrationCapability {
	/** Registers one first-level static authoring extension during this plugin's active configureEngine hook. */
	extendStatic: (name: string, implementation: unknown) => void
}

interface StaticExtensionEntry {
	owner: object
	implementation: unknown
}

interface PikaManagerState {
	entries: Map<string, StaticExtensionEntry>
	finalized: boolean
}

interface RegistrationGate {
	open: boolean
}

export interface PikaRegistrationController {
	readonly capability: PikaRegistrationCapability
	open: () => void
	close: () => void
}

const states = new WeakMap<PikaManager, PikaManagerState>()

/** @internal */
export function createPikaManager(): PikaManager {
	const manager: PikaManager = {
		getStatic(name) {
			return states.get(manager)!.entries.get(name)?.implementation
		},
	}
	states.set(manager, { entries: new Map(), finalized: false })
	return manager
}

/** @internal */
export function createPikaRegistrationController(manager: PikaManager, owner: object): PikaRegistrationController {
	const gate: RegistrationGate = { open: false }
	const capability: PikaRegistrationCapability = Object.freeze({
		extendStatic(name: string, implementation: unknown) {
			const state = states.get(manager)!
			if (state.finalized)
				throw new Error('Pika static extensions are finalized and cannot be modified')
			if (!gate.open)
				throw new Error('Pika static extensions may only be registered during this plugin configureEngine hook')
			if (typeof name !== 'string' || name.trim().length === 0)
				throw new Error('Pika static extension name must be a non-empty string')
			if (state.entries.has(name))
				throw new Error(`Pika static extension root "${name}" is already registered`)
			state.entries.set(name, { owner, implementation })
		},
	})
	return {
		capability,
		open: () => { gate.open = true },
		close: () => { gate.open = false },
	}
}

/** @internal */
export function getPikaStaticOwner(manager: PikaManager, name: string): object | undefined {
	return states.get(manager)!.entries.get(name)?.owner
}

/** @internal */
export function finalizePikaManager(manager: PikaManager): void {
	const state = states.get(manager)!
	state.finalized = true
	Object.freeze(manager)
}
