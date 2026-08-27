import { describe, expect, it } from 'vitest'
import * as hostApi from './host'
import * as authoringApi from './index'

describe('@pikacss/config/host public API', () => {
	it('keeps low-level host APIs off the ordinary authoring root', () => {
		expect(Object.keys(authoringApi)
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
		expect(Object.keys(hostApi)
			.sort())
			.toEqual([
				'PIKA_CONFIG_AUTO_CANDIDATES',
				'PikaConfigHostError',
				'createPikaScanMatcher',
				'loadPikaConfig',
			])
	})
})
