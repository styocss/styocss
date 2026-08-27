import type { PluginOptions } from './types'
import { describe, expect, expectTypeOf, it } from 'vitest'
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
				'consoleDiagnosticHandler',
				'createCtx',
				'createDefaultProcessorRegistry',
				'createEngine',
				'createFnConfig',
				'createLogger',
				'createPikaCSSContext',
				'createProcessorRegistry',
				'defineConfig',
				'defineEngineConfig',
				'defineEnginePlugin',
				'dialectForExtension',
				'escapeRegExp',
				'evaluateStatic',
				'getDiagnosticScope',
				'initPikaCSS',
				'inspectPikaCSSProject',
				'isPlainObjectRecord',
				'jsProcessor',
				'log',
				'nodeLoc',
				'parseJs',
				'parseJsExpression',
				'parseModuleId',
				'preparePikaCSS',
				'renderCSSStyleBlocks',
				'renderTypegenDocument',
				'renderTypegenJSDoc',
				'runWithDiagnosticScope',
				'sortLayerNames',
				'unpluginFactory',
			])
	})

	it('rejects unsupported Unplugin hosts at the shared factory boundary', () => {
		expect(() => api.unpluginFactory(undefined, { framework: 'esbuild' } as any))
			.toThrow('Unsupported PikaCSS bundler host: esbuild')
		expect(() => api.unpluginFactory(undefined, { framework: 'farm' } as any))
			.toThrow('Unsupported PikaCSS bundler host: farm')
	})

	it('keeps the public plugin options exact', () => {
		expectTypeOf<PluginOptions>()
			.toEqualTypeOf<{ config?: string, cwd?: string }>()
	})
})
