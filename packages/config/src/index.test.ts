import { describe, expect, it } from 'vitest'
import * as api from './index'
import { defineConfig } from './index'
import { readTransport } from './transport'

describe('@pikacss/config root API', () => {
	it('exports ordinary authoring APIs from core alongside the config helper', () => {
		expect(Object.keys(api)
			.sort())
			.toEqual([
				'createEngine',
				'createLogger',
				'defineConfig',
				'defineEngineConfig',
				'defineEnginePlugin',
				'escapeRegExp',
				'isPlainObjectRecord',
				'log',
				'renderCSSStyleBlocks',
				'renderTypegenDocument',
				'renderTypegenJSDoc',
				'sortLayerNames',
			])
	})

	it('returns an opaque frozen transport and preserves single/multi provenance', () => {
		const single = defineConfig({ fnName: 'css' })
		const multi = defineConfig([{ fnName: 'css', cssModule: 'css.css' }])

		expect(Object.isFrozen(single))
			.toBe(true)
		expect(Object.isFrozen(multi))
			.toBe(true)
		expect(Object.keys(single))
			.toEqual([])
		expect({ ...single })
			.toEqual({})
		expect(readTransport(single)?.authoringForm)
			.toBe('single')
		expect(readTransport(multi)?.authoringForm)
			.toBe('multi')
	})
})
