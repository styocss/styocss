import type { FrameworkProcessor } from './types'
import { describe, expect, it, vi } from 'vitest'
import { jsProcessor } from './js'
import { createDefaultProcessorRegistry, createProcessorRegistry, JS_PROCESSOR_EXTENSIONS } from './registry'

describe('createProcessorRegistry', () => {
	it('registers and resolves by normalized extension', async () => {
		const registry = createProcessorRegistry()
		const processor: FrameworkProcessor = { name: 'x', analyze: () => ({ fnName: 'pika', id: '', code: '', calls: [] }) }
		registry.register(['.Foo', 'BAR'], () => Promise.resolve(processor))

		expect(registry.has('foo'))
			.toBe(true)
		expect(registry.has('.FOO'))
			.toBe(true)
		expect(registry.has('bar'))
			.toBe(true)
		expect(registry.has('baz'))
			.toBe(false)
		expect(await registry.resolve('foo'))
			.toBe(processor)
		expect(registry.resolve('baz'))
			.toBeNull()
	})

	it('memoizes the loader so it runs once', async () => {
		const registry = createProcessorRegistry()
		const processor: FrameworkProcessor = { name: 'x', analyze: () => ({ fnName: 'pika', id: '', code: '', calls: [] }) }
		const loader = vi.fn(() => Promise.resolve(processor))
		registry.register(['a', 'b'], loader)

		await registry.resolve('a')
		await registry.resolve('b')
		await registry.resolve('a')
		expect(loader)
			.toHaveBeenCalledTimes(1)
	})
})

describe('createDefaultProcessorRegistry', () => {
	it('maps all JS-family extensions to the js processor', async () => {
		const registry = createDefaultProcessorRegistry()
		for (const ext of JS_PROCESSOR_EXTENSIONS) {
			expect(registry.has(ext))
				.toBe(true)
			expect(await registry.resolve(ext))
				.toBe(jsProcessor)
		}
	})

	it('has no processor for unsupported extensions', () => {
		const registry = createDefaultProcessorRegistry()
		expect(registry.has('svelte'))
			.toBe(false)
		expect(registry.has('astro'))
			.toBe(false)
		expect(registry.has('html'))
			.toBe(false)
	})
})
