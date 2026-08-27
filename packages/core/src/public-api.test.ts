import { describe, expect, it } from 'vitest'
import * as api from './index'

// Locks the published runtime export surface of the package's main entry.
// Any added/removed export is a deliberate, reviewed change (a SemVer event
// once 1.0 ships) rather than an accidental leak. Update the list intentionally
// when the public API changes.
describe('@pikacss/core public API surface', () => {
	it('exports exactly the intended runtime members', () => {
		expect(Object.keys(api)
			.sort())
			.toEqual([
				'createEngine',
				'createLogger',
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
})
