import type { EngineConfig } from '@pikacss/core'
import type { MultiProjectEntryConfig, SingleProjectConfig } from './index'
import { describe, expectTypeOf, it } from 'vitest'
import { defineConfig } from './index'

declare module '@pikacss/core' {
	interface EngineConfig {
		testAugmentedField?: { value: 'ok' }
	}
}

describe('project config authoring types', () => {
	it('preserves the exact plugin-augmented Core EngineConfig identity', () => {
		const engine: EngineConfig = { testAugmentedField: { value: 'ok' } }
		const single: SingleProjectConfig = { engine }
		const multi: MultiProjectEntryConfig = { engine, fnName: 'admin', cssModule: 'admin.css' }

		defineConfig(single)
		defineConfig([multi])
		expectTypeOf(single.engine)
			.toEqualTypeOf<EngineConfig | undefined>()
		expectTypeOf(multi.engine)
			.toEqualTypeOf<EngineConfig | undefined>()
	})

	it('accepts the single and non-empty explicit multi overloads', () => {
		expectTypeOf(defineConfig({}))
			.toMatchTypeOf<object>()
		expectTypeOf(defineConfig([{ fnName: 'admin', cssModule: 'admin.css' }]))
			.toMatchTypeOf<object>()
		expectTypeOf(defineConfig([
			{ fnName: 'admin', cssModule: 'admin.css' },
			{ fnName: 'docs', cssModule: 'docs.css', transformedFormat: 'array' },
		], { stateDir: '.state' }))
			.toMatchTypeOf<object>()
	})
	it('rejects invalid multi authoring shapes at compile time', () => {
		if (false) {
			// @ts-expect-error Explicit multi form must be non-empty.
			defineConfig([])
			// @ts-expect-error Multi entries require fnName.
			defineConfig([{ cssModule: 'admin.css' }])
			// @ts-expect-error Multi entries require cssModule.
			defineConfig([{ fnName: 'admin' }])
			// @ts-expect-error stateDir belongs to project-level multi options.
			defineConfig([{ fnName: 'admin', cssModule: 'admin.css', stateDir: '.state' }])
		}
	})
})
