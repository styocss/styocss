import type { TypegenJSDocRenderBindings } from './jsdoc'
import type { TypegenContribution, TypegenPreviewAsset, TypegenSnapshot, TypegenSnapshotContribution } from './snapshot'

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
	previewAssets: Map<string, TypegenPreviewAsset>
	renderOverrides: Map<string, (bindings: TypegenJSDocRenderBindings) => string>
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
const snapshotRenderOverrides = new WeakMap<TypegenSnapshot, ReadonlyMap<string, (bindings: TypegenJSDocRenderBindings) => string>>()
const MANAGED_REF_KEYS = ['selectors', 'properties', 'cssProperties', 'cssPropertyValues', 'propertyConstraints'] as const

function compareStrings(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0
}

function validateContribution(contribution: TypegenContribution): void {
	if (contribution == null || typeof contribution !== 'object' || Array.isArray(contribution))
		throw new Error('Typegen contribution must be an object')
	if (typeof contribution.id !== 'string' || contribution.id.trim().length === 0)
		throw new Error('Typegen contribution id must be a non-empty string')
	if (contribution.declarations !== undefined && typeof contribution.declarations !== 'string')
		throw new Error('Typegen declarations must be a string when provided')
	for (const key of MANAGED_REF_KEYS) {
		const ref = contribution[key]
		if (ref !== undefined && (typeof ref !== 'string' || ref.trim().length === 0))
			throw new Error(`Typegen managed attachment "${key}" must be a non-empty string when provided`)
	}
	if (contribution.pika !== undefined) {
		if (contribution.pika == null || typeof contribution.pika !== 'object' || Array.isArray(contribution.pika))
			throw new Error('Typegen Pika attachment must be an object when provided')
		for (const [root, ref] of Object.entries(contribution.pika)) {
			if (root.trim().length === 0)
				throw new Error('Typegen Pika root must be a non-empty string')
			if (typeof ref !== 'string' || ref.trim().length === 0)
				throw new Error(`Typegen Pika root "${root}" must reference a non-empty TypeScript expression`)
		}
	}
}

function freezePikaAttachment(pika: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
	return Object.freeze(Object.fromEntries(Object.entries(pika)
		.sort(([a], [b]) => compareStrings(a, b))))
}

function freezeContribution(contribution: TypegenContribution): TypegenSnapshotContribution {
	const result: TypegenSnapshotContribution = {
		id: contribution.id,
		...(contribution.declarations === undefined ? {} : { declarations: contribution.declarations }),
		...(contribution.pika === undefined ? {} : { pika: freezePikaAttachment(contribution.pika) }),
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
		previewAssets: new Map(),
		renderOverrides: new Map(),
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
			validateContribution(contribution)
			if (state.ids.has(contribution.id))
				throw new Error(`Typegen contribution id "${contribution.id}" is already registered`)

			for (const root of Object.keys(contribution.pika ?? {})
				.sort(compareStrings)) {
				if (state.pikaOwners.has(root))
					throw new Error(`Typegen Pika root "${root}" is already registered`)
			}

			const value = freezeContribution(contribution)
			state.ids.add(value.id)
			for (const root of Object.keys(value.pika ?? {})
				.sort(compareStrings))
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

/**
 * Replaces one Core-owned generated declaration and attaches path-free render
 * metadata after plugin configuration settles but before Typegen finalization.
 * Third-party raw `declarations` never pass through this seam.
 * @internal
 */
export function setCoreGeneratedTypegenContribution(
	manager: TypegenManager,
	id: string,
	options: {
		readonly declarations: string
		readonly renderDeclarations: (bindings: TypegenJSDocRenderBindings) => string
		readonly previewAssets?: readonly TypegenPreviewAsset[]
	},
): void {
	const state = states.get(manager)!
	if (state.finalized)
		throw new Error('Typegen contributions are finalized and cannot be modified')
	const index = state.contributions.findIndex(({ value }) => value.id === id)
	if (index < 0)
		throw new Error(`Typegen contribution id "${id}" is not registered`)
	// Validate the whole replacement before mutating any manager state. A Core
	// finalizer failure is part of createEngine()'s atomic initialization
	// outcome: conflicting/invalid preview metadata must not leave declarations,
	// render overrides, or assets partially replaced.
	const validatedAssets = new Map<string, TypegenPreviewAsset>()
	for (const asset of options.previewAssets ?? []) {
		if (asset == null || typeof asset !== 'object' || typeof asset.id !== 'string' || asset.id.length === 0)
			throw new Error('Typegen preview asset id must be a non-empty string')
		if (typeof asset.content !== 'string' || typeof asset.mediaType !== 'string' || asset.mediaType.length === 0)
			throw new Error(`Typegen preview asset "${asset.id}" must provide string content and a non-empty mediaType`)
		const previous = validatedAssets.get(asset.id) ?? state.previewAssets.get(asset.id)
		if (previous != null && (previous.content !== asset.content || previous.mediaType !== asset.mediaType))
			throw new Error(`Typegen preview asset id "${asset.id}" is already registered with different content`)
		validatedAssets.set(asset.id, Object.freeze({ ...asset }))
	}

	const existing = state.contributions[index]!
	state.contributions[index] = {
		owner: existing.owner,
		value: Object.freeze({ ...existing.value, declarations: options.declarations }),
	}
	state.renderOverrides.set(id, options.renderDeclarations)
	for (const [assetId, asset] of validatedAssets)
		state.previewAssets.set(assetId, asset)
}

/** @internal */
export function renderTypegenContributionDeclarations(
	snapshot: TypegenSnapshot,
	contribution: TypegenSnapshotContribution,
	bindings: TypegenJSDocRenderBindings,
): string | undefined {
	return snapshotRenderOverrides.get(snapshot)
		?.get(contribution.id)?.(bindings) ?? contribution.declarations
}

/** @internal */
export function validateTypegenPikaOwners(
	manager: TypegenManager,
	getRuntimeOwner: (root: string) => object | undefined,
): void {
	const state = states.get(manager)!
	for (const root of [...state.pikaOwners.keys()].sort(compareStrings)) {
		const typegenOwner = state.pikaOwners.get(root)!
		const runtimeOwner = getRuntimeOwner(root)
		if (runtimeOwner != null && runtimeOwner !== typegenOwner)
			throw new Error(`Pika root "${root}" has different runtime and Typegen owners`)
	}
}

/** @internal */
export function finalizeTypegenManager(manager: TypegenManager): void {
	const state = states.get(manager)!
	const contributions = Object.freeze(state.contributions
		.map(({ value }) => value)
		.sort((a, b) => compareStrings(a.id, b.id)))
	const previewAssets = Object.freeze([...state.previewAssets.values()]
		.sort((a, b) => compareStrings(a.id, b.id)))
	const snapshot = Object.freeze({ contributions, previewAssets })
	state.snapshot = snapshot
	snapshotRenderOverrides.set(snapshot, new Map(state.renderOverrides))
	state.finalized = true
	Object.freeze(manager)
}
