import { describe, expect, it } from 'vitest'
import * as api from './index'

// Locks the published runtime export surface of the package's main entry.
// Any added/removed export is a deliberate, reviewed change (a SemVer event
// once 1.0 ships) rather than an accidental leak.
//
// NOTE: this entry currently re-exports low-level compiler internals
// (`analyzeJs`, `parseJs`, `evaluateStatic`, `nodeLoc`, the processor registry,
// ...). Those are candidates for a future move behind an explicit
// `@pikacss/integration/compiler` subpath so the stable surface stays small;
// until then this test documents the full surface so the decision is explicit.
describe('@pikacss/integration public API surface', () => {
	it('exports exactly the intended runtime members', () => {
		expect(Object.keys(api)
			.sort())
			.toEqual([
				'JS_PROCESSOR_EXTENSIONS',
				'PikaStaleTransformError',
				'PikaTransformError',
				'analyzeJs',
				'consoleDiagnosticHandler',
				'createCtx',
				'createDefaultProcessorRegistry',
				'createEngine',
				'createFnConfig',
				'createLogger',
				'createProcessorRegistry',
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
				'renderTypegenDocument',
				'renderTypegenJSDoc',
				'runWithDiagnosticScope',
				'sortLayerNames',
			])
	})
})
