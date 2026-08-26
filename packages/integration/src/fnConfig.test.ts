import { describe, expect, it } from 'vitest'
import { createFnConfig } from './fnConfig'

describe('createFnConfig', () => {
	it('describes only the configured reserved base identifier', () => {
		const config = createFnConfig('pika')
		expect(config.fnName)
			.toBe('pika')
		expect(config.roots)
			.toEqual(new Set(['pika']))
		expect(Object.keys(config)
			.sort())
			.toEqual(['fnName', 'roots'])
	})

	it('supports a custom reserved base identifier without deriving member variants', () => {
		const config = createFnConfig('styled')
		expect(config.fnName)
			.toBe('styled')
		expect(config.roots)
			.toEqual(new Set(['styled']))
	})
})
