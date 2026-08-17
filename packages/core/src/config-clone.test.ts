/**
 * #117 — cloneEngineConfig gives each createEngine() invocation an
 * independent working graph: ordinary config data is recursively isolated,
 * behavioral identities (functions, plugin definitions, opaque instances)
 * are preserved.
 */
import { describe, expect, it } from 'vitest'
import { cloneEngineConfig } from './config-clone'
import { defineEnginePlugin } from './plugin'

describe('cloneEngineConfig', () => {
	it('recursively isolates plain objects and arrays, including augmented fields', () => {
		const caller = {
			layers: { base: 0 },
			foo: { options: { enabled: false }, list: [{ deep: 1 }] },
		} as any
		const working = cloneEngineConfig(caller) as any

		working.layers.base = 99
		working.foo.options.enabled = true
		working.foo.list[0].deep = 2
		working.foo.list.push({ deep: 3 })

		expect(caller.layers)
			.toEqual({ base: 0 })
		expect(caller.foo)
			.toEqual({ options: { enabled: false }, list: [{ deep: 1 }] })
	})

	it('isolates Map and Set contents including their config-data values', () => {
		const entryValue = { count: 1 }
		const setValue = { flag: false }
		const caller = {
			augmentedMap: new Map([['a', entryValue]]),
			augmentedSet: new Set([setValue]),
		} as any
		const working = cloneEngineConfig(caller) as any

		expect(working.augmentedMap)
			.not.toBe(caller.augmentedMap)
		expect(working.augmentedSet)
			.not.toBe(caller.augmentedSet)
		working.augmentedMap.get('a').count = 2
		;[...working.augmentedSet][0].flag = true

		expect(entryValue.count)
			.toBe(1)
		expect(setValue.flag)
			.toBe(false)
	})

	it('copies Date and RegExp by value', () => {
		const date = new Date('2026-01-01T00:00:00Z')
		const regexp = /pk-\w+/g
		regexp.lastIndex = 4
		const working = cloneEngineConfig({ augmentedDate: date, augmentedRe: regexp } as any) as any

		expect(working.augmentedDate)
			.not.toBe(date)
		expect(working.augmentedDate.getTime())
			.toBe(date.getTime())
		expect(working.augmentedRe)
			.not.toBe(regexp)
		expect(working.augmentedRe.source)
			.toBe(regexp.source)
		expect(working.augmentedRe.flags)
			.toBe(regexp.flags)
		expect(working.augmentedRe.lastIndex)
			.toBe(4)
	})

	it('preserves function identity', () => {
		const callback = () => 'preflight'
		const working = cloneEngineConfig({ preflights: [callback] } as any) as any

		expect(working.preflights[0])
			.toBe(callback)
	})

	it('preserves opaque class-instance identity', () => {
		class TokenSource {
			value = 1
		}
		const instance = new TokenSource()
		const working = cloneEngineConfig({ augmentedOpaque: { source: instance } } as any) as any

		expect(working.augmentedOpaque.source)
			.toBe(instance)
	})

	it('copies the plugins array while preserving plugin definition identity', () => {
		const plugin = defineEnginePlugin({ name: 'identity' })
		const caller = { plugins: [plugin] }
		const working = cloneEngineConfig(caller)

		expect(working.plugins)
			.not.toBe(caller.plugins)
		expect(working.plugins![0])
			.toBe(plugin)
	})

	it('preserves cycles and diamond references inside the working copy', () => {
		const shared = { hits: 0 }
		const nested: any = { shared }
		nested.self = nested
		const caller: any = { a: nested, b: { shared } }

		const working = cloneEngineConfig(caller) as any

		expect(working.a.self)
			.toBe(working.a)
		expect(working.a.shared)
			.toBe(working.b.shared)
		expect(working.a.shared)
			.not.toBe(shared)
	})

	it('clones null-prototype objects as plain config data', () => {
		const bare = Object.create(null)
		bare.enabled = false
		const working = cloneEngineConfig({ augmentedBare: bare } as any) as any

		working.augmentedBare.enabled = true
		expect(bare.enabled)
			.toBe(false)
	})
})
