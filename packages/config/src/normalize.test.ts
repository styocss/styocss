import { describe, expect, it } from 'vitest'
import { defineConfig } from './index'
import { DEFAULT_SCAN_EXCLUDE, DEFAULT_SCAN_INCLUDE, normalizeDefinedConfig } from './normalize'
import { createMultiTransport, createSingleTransport } from './transport'

const resolver = {
	resolvePath(value: string) {
		return value.startsWith('/') ? value : `/config/${value}`
	},
	resolvePattern(value: string) {
		return value.startsWith('/') ? value : `/config/${value}`
	},
}

describe('normalizeDefinedConfig', () => {
	it('normalizes the single form with canonical defaults exactly once', () => {
		const resolved = normalizeDefinedConfig(defineConfig({}), resolver)

		expect(resolved)
			.toEqual({
				authoringForm: 'single',
				stateDir: '/config/.pikacss',
				entries: [{
					engine: {},
					fnName: 'pika',
					cssModule: 'pika.css',
					transformedFormat: 'string',
					scan: {
						include: DEFAULT_SCAN_INCLUDE.map(pattern => `/config/${pattern}`),
						exclude: DEFAULT_SCAN_EXCLUDE.map(pattern => `/config/${pattern}`),
					},
					report: false,
				}],
			})
		expect(Object.isFrozen(resolved))
			.toBe(true)
		expect(Object.isFrozen(resolved.entries))
			.toBe(true)
		expect(Object.isFrozen(resolved.entries[0]!.scan.include))
			.toBe(true)
	})

	it('preserves explicit one-entry multi provenance and requires explicit roots/modules', () => {
		const resolved = normalizeDefinedConfig(defineConfig([
			{ fnName: 'admin', cssModule: '@app/admin.css' },
		]), resolver)

		expect(resolved.authoringForm)
			.toBe('multi')
		expect(resolved.entries)
			.toHaveLength(1)
		expect(resolved.entries[0])
			.toMatchObject({
				fnName: 'admin',
				cssModule: '@app/admin.css',
				transformedFormat: 'string',
			})
		expect(resolved.stateDir)
			.toBe('/config/.pikacss')
	})

	it('preserves plugin-owned EngineConfig keys without validating or rewriting them', () => {
		const engine = { pluginOwnedValue: { nested: true } } as any
		const resolved = normalizeDefinedConfig(defineConfig({ engine }), resolver)

		expect(resolved.entries[0]!.engine)
			.toBe(engine)
	})

	it('rejects plain unwrapped default exports', () => {
		expect(() => normalizeDefinedConfig({}, resolver))
			.toThrow('expected the opaque value returned by defineConfig()')
		expect(() => normalizeDefinedConfig([], resolver))
			.toThrow('expected the opaque value returned by defineConfig()')
	})

	it('rejects unknown project-owned keys and null/invalid envelope values', () => {
		expect(() => normalizeDefinedConfig(createSingleTransport({ unknown: true } as any), resolver))
			.toThrow('config.unknown: unknown configuration key')
		expect(() => normalizeDefinedConfig(createSingleTransport({ scan: null } as any), resolver))
			.toThrow('config.scan: expected an object')
		expect(() => normalizeDefinedConfig(createSingleTransport({ engine: null } as any), resolver))
			.toThrow('config.engine: expected an EngineConfig object')
		expect(() => normalizeDefinedConfig(createSingleTransport({ report: null } as any), resolver))
			.toThrow('config.report: expected false, true, or { output: string }')
		expect(() => normalizeDefinedConfig(createMultiTransport([
			{ fnName: 'a', cssModule: 'a.css', stateDir: 'nope' } as any,
		], {}), resolver))
			.toThrow('entries[0].stateDir: unknown configuration key')
		expect(() => normalizeDefinedConfig(createMultiTransport([
			{ fnName: 'a', cssModule: 'a.css' },
		], { extra: true } as any), resolver))
			.toThrow('project options.extra: unknown configuration key')
	})

	it('rejects malformed opaque transport envelopes at runtime', () => {
		expect(() => normalizeDefinedConfig(createSingleTransport(null as any), resolver))
			.toThrow('config: expected an object')
		expect(() => normalizeDefinedConfig(createMultiTransport([
			null as any,
		], {}), resolver))
			.toThrow('entries[0]: expected an object')
		expect(() => normalizeDefinedConfig(createMultiTransport([
			{ fnName: 'a', cssModule: 'a.css' },
		], null as any), resolver))
			.toThrow('project options: expected an object')
	})

	it('rejects empty multi configs and missing required multi roots/modules at runtime', () => {
		expect(() => normalizeDefinedConfig(createMultiTransport([], {}), resolver))
			.toThrow('explicit multi-entry config must contain at least one entry')
		expect(() => normalizeDefinedConfig(createMultiTransport([
			{ cssModule: 'a.css' } as any,
		], {}), resolver))
			.toThrow('entries[0].fnName: expected a string')
		expect(() => normalizeDefinedConfig(createMultiTransport([
			{ fnName: 'a' } as any,
		], {}), resolver))
			.toThrow('entries[0].cssModule: expected a string')
	})

	it('accepts Unicode binding identifiers and rejects reserved/escaped/member spellings', () => {
		for (const fnName of ['css', '$pika', '_pika2', 'π', '變數']) {
			expect(normalizeDefinedConfig(defineConfig({ fnName }), resolver).entries[0]!.fnName)
				.toBe(fnName)
		}

		for (const fnName of ['class', 'await', 'eval', 'arguments', 'undefined', 'NaN', 'Infinity', 'pika.str', 'two words', '\\u0070ika', '1pika']) {
			expect(() => normalizeDefinedConfig(createSingleTransport({ fnName }), resolver))
				.toThrow('not a valid ECMAScript/TypeScript value-binding identifier')
		}
	})

	it('accepts bare logical cssModule specifiers and rejects path/url-like forms', () => {
		for (const cssModule of ['pika.css', 'foo/bar.css', '@scope/pika.css', '@scope/admin/pika.css', 'virtual-style']) {
			expect(normalizeDefinedConfig(defineConfig({ cssModule }), resolver).entries[0]!.cssModule)
				.toBe(cssModule)
		}

		for (const cssModule of ['./pika.css', '../pika.css', '/abs/pika.css', 'C:\\pika.css', 'https://x/pika.css', 'foo?x', 'foo#x', 'foo/../bar', 'foo//bar', '@scope']) {
			expect(() => normalizeDefinedConfig(createSingleTransport({ cssModule }), resolver))
				.toThrow(/bare logical module specifier|path segments|package segment/)
		}
	})

	it('replaces scan include/exclude sides independently and preserves order/duplicates/empty arrays', () => {
		const includeOnly = normalizeDefinedConfig(defineConfig({
			scan: { include: ['src/b.ts', 'src/a.ts', 'src/a.ts'] },
		}), resolver).entries[0]!.scan
		expect(includeOnly.include)
			.toEqual(['/config/src/b.ts', '/config/src/a.ts', '/config/src/a.ts'])
		expect(includeOnly.exclude)
			.toEqual(DEFAULT_SCAN_EXCLUDE.map(pattern => `/config/${pattern}`))

		const excludeOnly = normalizeDefinedConfig(defineConfig({
			scan: { exclude: [] },
		}), resolver).entries[0]!.scan
		expect(excludeOnly.include)
			.toEqual(DEFAULT_SCAN_INCLUDE.map(pattern => `/config/${pattern}`))
		expect(excludeOnly.exclude)
			.toEqual([])

		const strings = normalizeDefinedConfig(defineConfig({
			scan: { include: 'src/**/*.ts', exclude: 'vendor/**' },
		}), resolver).entries[0]!.scan
		expect(strings)
			.toEqual({ include: ['/config/src/**/*.ts'], exclude: ['/config/vendor/**'] })
	})

	it('rejects empty scan patterns and invalid scan side shapes', () => {
		expect(() => normalizeDefinedConfig(createSingleTransport({ scan: { include: [''] } }), resolver))
			.toThrow('config.scan.include[0]: must not be empty')
		expect(() => normalizeDefinedConfig(createSingleTransport({ scan: { exclude: [null] as any } }), resolver))
			.toThrow('config.scan.exclude[0]: expected a string')
		expect(() => normalizeDefinedConfig(createSingleTransport({ scan: { include: 1 as any } }), resolver))
			.toThrow('config.scan.include: expected a string or array of strings')
	})

	it('normalizes report/state paths only through the supplied host resolver', () => {
		const resolved = normalizeDefinedConfig(defineConfig({
			stateDir: '../state',
			report: { output: 'artifacts/report.json' },
		}), resolver)

		expect(resolved.stateDir)
			.toBe('/config/../state')
		expect(resolved.entries[0]!.report)
			.toEqual({ output: '/config/artifacts/report.json' })
		expect(normalizeDefinedConfig(defineConfig({ report: true }), resolver).entries[0]!.report)
			.toEqual({})
	})

	it('rejects duplicate fnName/cssModule and resolved report-output collisions in multi form', () => {
		expect(() => normalizeDefinedConfig(defineConfig([
			{ fnName: 'same', cssModule: 'a.css' },
			{ fnName: 'same', cssModule: 'b.css' },
		]), resolver))
			.toThrow('duplicate configured root "same"')

		expect(() => normalizeDefinedConfig(defineConfig([
			{ fnName: 'a', cssModule: 'same.css' },
			{ fnName: 'b', cssModule: 'same.css' },
		]), resolver))
			.toThrow('duplicate logical module "same.css"')

		expect(() => normalizeDefinedConfig(defineConfig([
			{ fnName: 'a', cssModule: 'a.css', report: { output: '/same.json' } },
			{ fnName: 'b', cssModule: 'b.css', report: { output: '/same.json' } },
		]), resolver))
			.toThrow('duplicate resolved report output "/same.json"')
	})

	it('rejects invalid enums and empty path/report values', () => {
		expect(() => normalizeDefinedConfig(createSingleTransport({ transformedFormat: 'tuple' as any }), resolver))
			.toThrow('expected "string" or "array"')
		expect(() => normalizeDefinedConfig(createSingleTransport({ stateDir: '' }), resolver))
			.toThrow('config.stateDir: must not be empty')
		expect(() => normalizeDefinedConfig(createSingleTransport({ report: { output: '' } }), resolver))
			.toThrow('config.report.output: must not be empty')
	})
})
