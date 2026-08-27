import type { Engine, Variable } from '@pikacss/core'
import { fileURLToPath } from 'node:url'
import { createEngine } from '@pikacss/core'
import { describe, expect, it } from 'vitest'
import { DEFAULT_TYPE_AUTOCOMPLETE, mergeTypeAutocomplete, resolveTypeAutocomplete } from './autocomplete'
import { designTokens } from './node'

const fixturesRoot = fileURLToPath(new URL('./fixtures', import.meta.url))

// Reads the plugin-lowered canonical Variables leaf from effective raw config.
function variableLeaf(engine: Engine, varName: string): Variable | undefined {
	const definitions = [engine.config.rawConfig.variables?.definitions ?? []].flat()
	for (let index = definitions.length - 1; index >= 0; index--) {
		const value = definitions[index]?.[varName]
		if (value != null && typeof value === 'object' && ('value' in value || 'external' in value))
			return value as Variable
	}
	return undefined
}

function propsForVar(engine: Engine, varName: string): string[] {
	const leaf = variableLeaf(engine, varName)
	if (leaf == null || leaf.suggest?.asValueOf === false || leaf.suggest?.asValueOf == null)
		return []
	return [leaf.suggest.asValueOf].flat()
		.map(String)
		.sort()
}

function hasExtraProperty(engine: Engine, varName: string): boolean {
	return variableLeaf(engine, varName)?.suggest?.asProperty ?? true
}

describe('mergeTypeAutocomplete', () => {
	it('returns the default map unchanged when no override is given', () => {
		expect(mergeTypeAutocomplete())
			.toEqual(DEFAULT_TYPE_AUTOCOMPLETE)
	})

	it('replaces the entry for an overridden $type and keeps the rest', () => {
		const merged = mergeTypeAutocomplete({ color: ['color'] })
		expect(merged.color)
			.toEqual(['color'])
		expect(merged.dimension)
			.toEqual(DEFAULT_TYPE_AUTOCOMPLETE.dimension)
	})

	it('carries a false entry through so it can suppress suggestions', () => {
		expect(mergeTypeAutocomplete({ color: false }).color)
			.toBe(false)
	})

	it('adds an entry for a $type absent from the default map', () => {
		expect(mergeTypeAutocomplete({ gradient: ['background', 'background-image'] }).gradient)
			.toEqual(['background', 'background-image'])
	})
})

describe('resolveTypeAutocomplete', () => {
	const merged = mergeTypeAutocomplete({ color: false, fontWeight: 'font-weight' })

	it('returns undefined for a missing $type or one absent from the map', () => {
		expect(resolveTypeAutocomplete(undefined, merged))
			.toBeUndefined()
		expect(resolveTypeAutocomplete('unknown', merged))
			.toBeUndefined()
	})

	it('returns false for a suppressed ($type: false) entry', () => {
		expect(resolveTypeAutocomplete('color', merged))
			.toBe(false)
	})

	it('returns the property list for a mapped $type', () => {
		expect(resolveTypeAutocomplete('dimension', merged))
			.toEqual(DEFAULT_TYPE_AUTOCOMPLETE.dimension)
	})

	it('normalizes a single-string entry into a one-element list', () => {
		expect(resolveTypeAutocomplete('fontWeight', merged))
			.toEqual(['font-weight'])
	})
})

describe('e-type-autocomplete fixture', () => {
	// Each typed token registers as a CSS variable AND, from its `$type`, populates
	// autocomplete.asValueOf with exactly the default-map property set for that type.
	const cases: Array<{ varName: string, type: keyof typeof DEFAULT_TYPE_AUTOCOMPLETE }> = [
		{ varName: '--color-primary', type: 'color' },
		{ varName: '--space-md', type: 'dimension' },
		{ varName: '--motion-fast', type: 'duration' },
		{ varName: '--font-family-sans', type: 'fontFamily' },
		{ varName: '--font-weight-bold', type: 'fontWeight' },
		{ varName: '--z-modal', type: 'number' },
	]

	it('registers each token as asValueOf for exactly its $type default properties', async () => {
		const engine = await createEngine({
			plugins: [designTokens()],
			designTokens: {
				pruneUnused: false,
				root: fixturesRoot,
				sources: ['E-type-autocomplete/typed.tokens.json'],
			},
		})

		for (const { varName, type } of cases) {
			expect(propsForVar(engine, varName))
				.toEqual([...DEFAULT_TYPE_AUTOCOMPLETE[type]!].sort())
			// asProperty is untouched, so the var still appears as an extra property.
			expect(hasExtraProperty(engine, varName))
				.toBe(true)
			// A typed token never falls back to the '*' catch-all.
			expect(propsForVar(engine, varName))
				.not
				.toContain('*')
		}
	})

	it('keeps the S1 false/default-no-suggestion behavior for tokens without a mapped $type', async () => {
		const engine = await createEngine({
			plugins: [designTokens()],
			designTokens: {
				pruneUnused: false,
				sources: {
					plain: { value: { $value: '#000' } },
					exotic: { grad: { $value: 'linear-gradient(#000,#fff)', $type: 'gradient' } },
				},
			},
		})
		expect(propsForVar(engine, '--plain-value'))
			.toEqual([])
		expect(propsForVar(engine, '--exotic-grad'))
			.toEqual([])
	})
})

describe('typeAutocomplete override', () => {
	it('replaces the default list for an overridden $type', async () => {
		const engine = await createEngine({
			plugins: [designTokens()],
			designTokens: {
				pruneUnused: false,
				typeAutocomplete: { color: ['color'] },
				sources: { color: { primary: { $value: '#3b82f6', $type: 'color' } } },
			},
		})
		expect(propsForVar(engine, '--color-primary'))
			.toEqual(['color'])
	})

	it('suppresses value-of suggestions when the override is false, but keeps the var as an extra property', async () => {
		const engine = await createEngine({
			plugins: [designTokens()],
			designTokens: {
				pruneUnused: false,
				typeAutocomplete: { color: false },
				sources: { color: { primary: { $value: '#3b82f6', $type: 'color' } } },
			},
		})
		// No property (including the '*' catch-all) suggests the suppressed var.
		expect(propsForVar(engine, '--color-primary'))
			.toEqual([])
		expect(hasExtraProperty(engine, '--color-primary'))
			.toBe(true)
		// The variable itself is still emitted as CSS.
		expect(await engine.renderPreflights(false))
			.toContain('--color-primary:#3b82f6')
	})
})
