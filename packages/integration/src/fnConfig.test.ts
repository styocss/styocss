import { describe, expect, it } from 'vitest'
import { createFnConfig, resolveOutputFormat } from './fnConfig'

describe('createFnConfig', () => {
	it('derives all three dot-form variants from the base name', () => {
		const config = createFnConfig('pika')

		expect(new Set(config.variants.keys()))
			.toEqual(new Set(['pika', 'pika.str', 'pika.arr']))
		expect(config.fnName)
			.toBe('pika')
		expect(config.roots)
			.toEqual(new Set(['pika']))
	})

	it('classifies output kind per variant', () => {
		const config = createFnConfig('pika')

		expect(config.variants.get('pika'))
			.toEqual({ name: 'pika', root: 'pika', property: null, kind: 'normal' })
		expect(config.variants.get('pika.str'))
			.toEqual({ name: 'pika.str', root: 'pika', property: 'str', kind: 'forceString' })
		expect(config.variants.get('pika.arr'))
			.toEqual({ name: 'pika.arr', root: 'pika', property: 'arr', kind: 'forceArray' })
	})

	it('derives variants from a custom base name', () => {
		const config = createFnConfig('styled')

		expect(new Set(config.variants.keys()))
			.toEqual(new Set(['styled', 'styled.str', 'styled.arr']))
		expect(config.roots)
			.toEqual(new Set(['styled']))
	})
})

describe('resolveOutputFormat', () => {
	it('follows transformedFormat for normal variants', () => {
		const config = createFnConfig('pika')

		expect(resolveOutputFormat(config.variants.get('pika')!, 'string'))
			.toBe('string')
		expect(resolveOutputFormat(config.variants.get('pika')!, 'array'))
			.toBe('array')
	})

	it('forces the format for str/arr variants regardless of transformedFormat', () => {
		const config = createFnConfig('pika')

		expect(resolveOutputFormat(config.variants.get('pika.str')!, 'array'))
			.toBe('string')
		expect(resolveOutputFormat(config.variants.get('pika.arr')!, 'string'))
			.toBe('array')
	})
})
