import type { AtomicStyleIdStrategy } from './diagnostics'
import { describe, expect, it } from 'vitest'

import {
	createEngineStore,
	getAtomicStyleBaseKey,
	getAtomicStyleId,
	optimizeAtomicStyleContents,
	resolveAtomicStyle,
} from './atomic-style'
import { numberToChars } from './utils'

const defaultAtomicStyleIdStrategy: AtomicStyleIdStrategy = ({ index, prefix }) => `${prefix}${numberToChars(index)}`

describe('createEngineStore', () => {
	it('creates empty registries for new atomic-style state', () => {
		const store = createEngineStore()

		expect(store.atomicStyleIds.size)
			.toBe(0)
		expect(store.atomicStyles.size)
			.toBe(0)
		expect(store.atomicStyleIdsByBaseKey.size)
			.toBe(0)
		expect(store.atomicStyleOrder.size)
			.toBe(0)
	})
})

describe('getAtomicStyleId', () => {
	it('reuses the same id for order-insensitive content that already has a stored key', () => {
		const stored = new Map<string, string>()
		const content = {
			selector: ['.button'],
			property: 'color',
			value: ['red'],
		}

		const firstId = getAtomicStyleId({ content, prefix: 'p-', stored, atomicStyleIdStrategy: defaultAtomicStyleIdStrategy })
		const secondId = getAtomicStyleId({ content, prefix: 'p-', stored, atomicStyleIdStrategy: defaultAtomicStyleIdStrategy })

		expect(firstId)
			.toBe('p-a')
		expect(secondId)
			.toBe(firstId)
		expect(stored.size)
			.toBe(1)
	})

	it('generates distinct ids when order-sensitive content shares the same base key', () => {
		const stored = new Map<string, string>()
		const content = {
			selector: ['.button'],
			property: 'color',
			value: ['red'],
			orderSensitiveTo: ['dependency-key'],
		}

		const firstId = getAtomicStyleId({ content, prefix: 'p-', stored, atomicStyleIdStrategy: defaultAtomicStyleIdStrategy })
		const secondId = getAtomicStyleId({ content, prefix: 'p-', stored, atomicStyleIdStrategy: defaultAtomicStyleIdStrategy })

		expect(firstId)
			.toBe('p-a')
		expect(secondId)
			.toBe('p-b')
		expect(secondId).not.toBe(firstId)
		expect(stored.size)
			.toBe(2)
	})
})

describe('resolveAtomicStyle', () => {
	it('registers a new atomic style when the store does not already contain the generated id', () => {
		const store = createEngineStore()
		const content = {
			selector: ['.button'],
			property: 'color',
			value: ['red'],
		}

		const result = resolveAtomicStyle({
			content,
			prefix: 'p-',
			store,
			resolvedIdsByBaseKey: new Map<string, string>(),
			atomicStyleIdStrategy: defaultAtomicStyleIdStrategy,
		})

		expect(result.atomicStyle)
			.toEqual({ id: result.id, content })
		expect(store.atomicStyles.get(result.id))
			.toEqual({ id: result.id, content })
		expect(store.atomicStyleIdsByBaseKey.get(getAtomicStyleBaseKey(content)))
			.toEqual([result.id])
	})

	it('reuses an existing order-sensitive id when dependency order already allows the same declaration', () => {
		const store = createEngineStore()
		const resolvedIdsByBaseKey = new Map<string, string>()
		const dependencyContent = {
			selector: ['.button'],
			property: 'color',
			value: ['red'],
		}

		const dependency = resolveAtomicStyle({
			content: dependencyContent,
			prefix: 'p-',
			store,
			resolvedIdsByBaseKey,
			atomicStyleIdStrategy: defaultAtomicStyleIdStrategy,
		})
		resolvedIdsByBaseKey.set(getAtomicStyleBaseKey(dependencyContent), dependency.id)

		const content = {
			selector: ['.button'],
			property: 'background-color',
			value: ['blue'],
			orderSensitiveTo: [getAtomicStyleBaseKey(dependencyContent)],
		}

		const firstResolution = resolveAtomicStyle({
			content,
			prefix: 'p-',
			store,
			resolvedIdsByBaseKey,
			atomicStyleIdStrategy: defaultAtomicStyleIdStrategy,
		})
		const secondResolution = resolveAtomicStyle({
			content,
			prefix: 'p-',
			store,
			resolvedIdsByBaseKey,
			atomicStyleIdStrategy: defaultAtomicStyleIdStrategy,
		})

		expect(firstResolution.atomicStyle)
			.toEqual({ id: firstResolution.id, content })
		expect(secondResolution)
			.toEqual({ id: firstResolution.id })
	})

	it('reuses an earlier order-sensitive candidate when a later declaration with the same base key has no prior overlap requirements', () => {
		const store = createEngineStore()
		const selector = ['.button']
		const dependencyContent = {
			selector,
			property: 'padding-bottom',
			value: ['8px'],
		}
		const dependency = resolveAtomicStyle({
			content: dependencyContent,
			prefix: 'p-',
			store,
			resolvedIdsByBaseKey: new Map<string, string>(),
			atomicStyleIdStrategy: defaultAtomicStyleIdStrategy,
		})

		const shorthandContent = {
			selector,
			property: 'padding',
			value: ['32px'],
			orderSensitiveTo: [getAtomicStyleBaseKey(dependencyContent)],
		}
		const firstResolution = resolveAtomicStyle({
			content: shorthandContent,
			prefix: 'p-',
			store,
			resolvedIdsByBaseKey: new Map<string, string>([[getAtomicStyleBaseKey(dependencyContent), dependency.id]]),
			atomicStyleIdStrategy: defaultAtomicStyleIdStrategy,
		})

		const laterOrderInsensitiveResolution = resolveAtomicStyle({
			content: {
				selector,
				property: 'padding',
				value: ['32px'],
			},
			prefix: 'p-',
			store,
			resolvedIdsByBaseKey: new Map<string, string>(),
			atomicStyleIdStrategy: defaultAtomicStyleIdStrategy,
		})

		expect(firstResolution.atomicStyle)
			.toEqual({ id: firstResolution.id, content: shorthandContent })
		expect(laterOrderInsensitiveResolution)
			.toEqual({ id: firstResolution.id })
	})

	it('returns an existing id without re-registering when the generated id is already present in the store', () => {
		const store = createEngineStore()
		const content = {
			selector: ['.button'],
			property: 'color',
			value: ['red'],
		}
		const existingId = getAtomicStyleId({ content, prefix: 'p-', stored: store.atomicStyleIds, atomicStyleIdStrategy: defaultAtomicStyleIdStrategy })
		store.atomicStyles.set(existingId, { id: existingId, content })

		expect(resolveAtomicStyle({
			content,
			prefix: 'p-',
			store,
			resolvedIdsByBaseKey: new Map<string, string>(),
			atomicStyleIdStrategy: defaultAtomicStyleIdStrategy,
		}))
			.toEqual({ id: existingId })
		expect(store.atomicStyleIdsByBaseKey.size)
			.toBe(0)
	})

	it('creates a new order-sensitive id when an existing candidate appears before the required dependency order', () => {
		const store = createEngineStore()
		const content = {
			selector: ['.button'],
			property: 'background-color',
			value: ['blue'],
			orderSensitiveTo: ['dependency-key'],
		}

		const firstId = getAtomicStyleId({ content, prefix: 'p-', stored: store.atomicStyleIds, atomicStyleIdStrategy: defaultAtomicStyleIdStrategy })
		store.atomicStyles.set(firstId, { id: firstId, content })
		store.atomicStyleIdsByBaseKey.set(getAtomicStyleBaseKey(content), [firstId])
		store.atomicStyleOrder.set(firstId, 0)
		store.atomicStyleOrder.set('p-dependency', 1)

		const result = resolveAtomicStyle({
			content,
			prefix: 'p-',
			store,
			resolvedIdsByBaseKey: new Map<string, string>([['dependency-key', 'p-dependency']]),
			atomicStyleIdStrategy: defaultAtomicStyleIdStrategy,
		})

		expect(result.id)
			.toBe('p-b')
		expect(result.atomicStyle)
			.toEqual({ id: 'p-b', content })
	})

	it('reuses an order-sensitive candidate when dependencies are missing or have no recorded order', () => {
		const store = createEngineStore()
		const content = {
			selector: ['.button'],
			property: 'background-color',
			value: ['blue'],
			orderSensitiveTo: ['missing-key', 'unordered-key'],
		}

		const firstId = getAtomicStyleId({ content, prefix: 'p-', stored: store.atomicStyleIds, atomicStyleIdStrategy: defaultAtomicStyleIdStrategy })
		store.atomicStyles.set(firstId, { id: firstId, content })
		store.atomicStyleIdsByBaseKey.set(getAtomicStyleBaseKey(content), [firstId])
		store.atomicStyleOrder.set(firstId, 0)

		expect(resolveAtomicStyle({
			content,
			prefix: 'p-',
			store,
			resolvedIdsByBaseKey: new Map<string, string>([['unordered-key', 'p-x']]),
			atomicStyleIdStrategy: defaultAtomicStyleIdStrategy,
		}))
			.toEqual({ id: firstId })
	})

	it('skips candidate ids with no recorded order when searching for reusable order-sensitive styles', () => {
		const store = createEngineStore()
		const content = {
			selector: ['.button'],
			property: 'background-color',
			value: ['blue'],
			orderSensitiveTo: ['dependency-key'],
		}

		const firstId = getAtomicStyleId({ content, prefix: 'p-', stored: store.atomicStyleIds, atomicStyleIdStrategy: defaultAtomicStyleIdStrategy })
		store.atomicStyles.set(firstId, { id: firstId, content })
		store.atomicStyleIdsByBaseKey.set(getAtomicStyleBaseKey(content), [firstId])
		// Do NOT set atomicStyleOrder for firstId — candidateOrder will be undefined

		const result = resolveAtomicStyle({
			content,
			prefix: 'p-',
			store,
			resolvedIdsByBaseKey: new Map<string, string>(),
			atomicStyleIdStrategy: defaultAtomicStyleIdStrategy,
		})

		expect(result.id).not.toBe(firstId)
		expect(result.atomicStyle)
			.toEqual({ id: result.id, content })
	})
})

describe('optimizeAtomicStyleContents', () => {
	it('records order-sensitive dependencies when later declarations overlap earlier ones in the same selector scope', () => {
		const list = [
			{ selector: ['.button'], property: 'padding-top', value: ['1rem'] },
			{ selector: ['.button'], property: 'padding', value: ['2rem'] },
		]

		expect(optimizeAtomicStyleContents(list))
			.toEqual([
				{ selector: ['.button'], property: 'padding-top', value: ['1rem'] },
				{
					selector: ['.button'],
					property: 'padding',
					value: ['2rem'],
					orderSensitiveTo: [
						getAtomicStyleBaseKey({
							selector: ['.button'],
							property: 'padding-top',
							value: ['1rem'],
						}),
					],
				},
			])
	})

	it('drops deleted declarations without affecting other selector scopes', () => {
		const list = [
			{ selector: ['.button'], property: 'color', value: ['red'] },
			{ selector: ['.card'], property: 'color', value: ['blue'] },
			{ selector: ['.button'], property: 'color', value: null },
		]

		expect(optimizeAtomicStyleContents(list))
			.toEqual([
				{ selector: ['.card'], property: 'color', value: ['blue'] },
			])
	})
})
