import { describe, expect, it } from 'vitest'
import {
	pickSupportedProviderOptions,
	resolveProviderOptions,
	serializeProviderOptionsIdentity,
} from './provider-options'

describe('provider option semantics', () => {
	it('resolves per-font overrides over defaults and removes nullish deletion markers', () => {
		expect(resolveProviderOptions(
			{ text: 'GLOBAL', subset: 'latin', preload: true },
			{ text: 'LOCAL', preload: false },
		))
			.toEqual({ text: 'LOCAL', subset: 'latin', preload: false })

		expect(resolveProviderOptions(
			{ text: 'GLOBAL', subset: 'latin' },
			{ text: null },
		))
			.toEqual({ subset: 'latin' })

		expect(resolveProviderOptions(
			{ text: 'GLOBAL', subset: 'latin' },
			{ text: undefined },
		))
			.toEqual({ subset: 'latin' })
	})

	it('snapshots array values instead of retaining mutable config references', () => {
		const text = ['A', 'B']
		const resolved = resolveProviderOptions({ text }, {})

		text.push('C')

		expect(resolved)
			.toEqual({ text: ['A', 'B'] })
	})

	it('projects only supported active options for built-in request batching', () => {
		expect(pickSupportedProviderOptions(
			{ text: ['A', 'B'], subset: 'latin', disabled: false },
			['text', 'disabled'],
		))
			.toEqual({ text: ['A', 'B'], disabled: false })

		expect(pickSupportedProviderOptions(
			{ subset: 'latin' },
			['text', 'disabled'],
		))
			.toEqual({})
	})

	it('produces stable structural identities without collapsing distinct active values', () => {
		expect(serializeProviderOptionsIdentity({ text: 'A', enabled: true }))
			.toBe(serializeProviderOptionsIdentity({ enabled: true, text: 'A' }))

		expect(serializeProviderOptionsIdentity({ value: Number.NaN }))
			.not.toBe(serializeProviderOptionsIdentity({ value: 'NaN' }))
		expect(serializeProviderOptionsIdentity({ value: -0 }))
			.not.toBe(serializeProviderOptionsIdentity({ value: 0 }))
		expect(serializeProviderOptionsIdentity({ text: ['A', 1, false] }))
			.not.toBe(serializeProviderOptionsIdentity({ text: ['A', '1', false] }))
	})
})
