import { describe, expect, it } from 'vitest'

import { createEngine } from '../engine'
import { important } from './important'

// The engine dispatcher always supplies a hook context; direct hook calls
// must model it (state/host shape kept loose for cross-version stability).
const context = { onDiagnostic: () => {}, state: undefined, host: {} } as any

describe('important plugin', () => {
	it('registers the __important autocomplete contract during engine configuration', async () => {
		const plugin = important()
		const contributions: unknown[] = []

		await plugin.configureEngine?.({
			...context,
			runtime: {
				appendAutocomplete(contribution: unknown) {
					contributions.push(contribution)
				},
			},
		} as any)

		expect(contributions)
			.toEqual([
				{
					extraProperties: '__important',
					properties: { __important: 'boolean' },
				},
			])
	})

	it('leaves style definitions unchanged when important is disabled by default', () => {
		const plugin = important()
		plugin.rawConfigConfigured?.({}, context)

		const styleDefinitions = [
			{ color: 'red', nested: { color: 'blue' } },
		]

		expect(plugin.transformStyleDefinitions?.(styleDefinitions as any, context))
			.toEqual(styleDefinitions)
	})

	it('appends !important to string, tuple, and nullish property values when the global default is enabled', () => {
		const plugin = important()
		plugin.rawConfigConfigured?.({ important: { default: true } }, context)

		const styleDefinitions = [
			{
				color: 'red',
				margin: ['1rem', ['2rem', '3rem']],
				padding: null,
				nested: { color: 'blue' },
			},
		]

		expect(plugin.transformStyleDefinitions?.(styleDefinitions as any, context))
			.toEqual([
				{
					color: 'red !important',
					margin: ['1rem !important', ['2rem !important', '3rem !important']],
					padding: null,
					nested: { color: 'blue' },
				},
			])
	})

	it('lets a style definition opt out of the global default with __important set to false', () => {
		const plugin = important()
		plugin.rawConfigConfigured?.({ important: { default: true } }, context)

		expect(plugin.transformStyleDefinitions?.([
			{ color: 'red', __important: false },
		] as any, context))
			.toEqual([
				{ color: 'red' },
			])
	})

	it('adds !important for one style definition when __important is true even if the global default is disabled', () => {
		const plugin = important()
		plugin.rawConfigConfigured?.({ important: { default: false } }, context)

		expect(plugin.transformStyleDefinitions?.([
			{ color: 'red', __important: true },
		] as any, context))
			.toEqual([
				{ color: 'red !important' },
			])
	})

	it('propagates an explicit __important flag into nested selector blocks', () => {
		const plugin = important()
		plugin.rawConfigConfigured?.({ important: { default: false } }, context)

		expect(plugin.transformStyleDefinitions?.([
			{ '__important': true, 'color': 'red', '$:hover': { color: 'blue' } },
		] as any, context))
			.toEqual([
				{ 'color': 'red !important', '$:hover': { __important: true, color: 'blue' } },
			])

		plugin.rawConfigConfigured?.({ important: { default: true } }, context)
		expect(plugin.transformStyleDefinitions?.([
			{ '__important': false, 'color': 'red', '$:hover': { color: 'blue' } },
		] as any, context))
			.toEqual([
				{ 'color': 'red', '$:hover': { __important: false, color: 'blue' } },
			])
	})

	it('never modifies the __shortcut reference', () => {
		const plugin = important()
		plugin.rawConfigConfigured?.({ important: { default: true } }, context)

		expect(plugin.transformStyleDefinitions?.([
			{ __shortcut: 'btn', color: 'red' },
		] as any, context))
			.toEqual([
				{ __shortcut: 'btn', color: 'red !important' },
			])
	})

	it('applies !important to shortcut-expanded declarations end-to-end', async () => {
		const engine = await createEngine({
			important: { default: true },
			shortcuts: {
				definitions: [['btn', { display: 'flex' }]],
			},
		})

		const idsFromString = await engine.use('btn')
		const idsFromDefinition = await engine.use({ __shortcut: 'btn', color: 'red' })
		const css = await engine.renderAtomicStyles(false, {
			atomicStyleIds: [...idsFromString, ...idsFromDefinition],
		})

		expect(css)
			.toContain('display:flex !important;')
		expect(css)
			.toContain('color:red !important;')
	})

	it('does not duplicate !important markers that are already present in property values', () => {
		const plugin = important()
		plugin.rawConfigConfigured?.({ important: { default: true } }, context)

		expect(plugin.transformStyleDefinitions?.([
			{ color: 'red !important', margin: ['1rem !important', ['2rem !important']] },
		] as any, context))
			.toEqual([
				{ color: 'red !important', margin: ['1rem !important', ['2rem !important']] },
			])
	})

	it('detects existing !important annotations case-insensitively and with whitespace', () => {
		const plugin = important()
		plugin.rawConfigConfigured?.({ important: { default: true } }, context)

		expect(plugin.transformStyleDefinitions?.([
			{ color: 'red !IMPORTANT', background: 'red !important ', border: 'red ! important', outline: 'red' },
		] as any, context))
			.toEqual([
				{ color: 'red !IMPORTANT', background: 'red !important ', border: 'red ! important', outline: 'red !important' },
			])
	})

	it('appends !important to numeric property values', () => {
		const plugin = important()
		plugin.rawConfigConfigured?.({ important: { default: true } }, context)

		expect(plugin.transformStyleDefinitions?.([
			{ margin: 0, padding: ['auto', [0]] },
		] as any, context))
			.toEqual([
				{ margin: '0 !important', padding: ['auto !important', ['0 !important']] },
			])
	})
})
