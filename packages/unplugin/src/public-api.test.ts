import { describe, expect, it } from 'vitest'
import * as api from './index'

// Locks the published runtime export surface of the package's main entry.
// Any added/removed export is a deliberate, reviewed change (a SemVer event
// once 1.0 ships) rather than an accidental leak.
//
// NOTE: this entry re-exports the whole of `@pikacss/integration` (including
// its compiler internals) plus its own plugin factory. Narrowing the
// re-export to the consumer-facing surface is a tracked follow-up; this test
// keeps the current surface explicit until then.
describe('@pikacss/unplugin-pikacss public API surface', () => {
	it('exports exactly the intended runtime members', () => {
		expect(Object.keys(api)
			.sort())
			.toEqual([
				'JS_PROCESSOR_EXTENSIONS',
				'PikaStaleTransformError',
				'PikaTransformError',
				'analyzeJs',
				'appendAutocomplete',
				'consoleDiagnosticHandler',
				'createCtx',
				'createDefaultProcessorRegistry',
				'createEngine',
				'createFnConfig',
				'createLogger',
				'createProcessorRegistry',
				'default',
				'defineEngineConfig',
				'defineEnginePlugin',
				'dialectForExtension',
				'escapeRegExp',
				'evaluateStatic',
				'getDiagnosticScope',
				'isPlainObjectRecord',
				'jsProcessor',
				'log',
				'nodeLoc',
				'parseJs',
				'parseJsExpression',
				'parseModuleId',
				'renderCSSStyleBlocks',
				'resolveOutputFormat',
				'runWithDiagnosticScope',
				'sortLayerNames',
				'unpluginFactory',
				'unpluginPika',
			])
	})
})
