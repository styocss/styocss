import { describe, expect, it } from 'vitest'

import { createEngine, createPikaCSSContext, defineEngineConfig, defineEnginePlugin } from './index'

describe('index exports', () => {
	it('re-exports integration helpers alongside supported core helpers', () => {
		expect(typeof createPikaCSSContext)
			.toBe('function')
		expect(typeof createEngine)
			.toBe('function')
		expect(typeof defineEngineConfig)
			.toBe('function')
		expect(typeof defineEnginePlugin)
			.toBe('function')
	})
})
