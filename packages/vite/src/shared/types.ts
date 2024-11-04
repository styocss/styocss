import type { StyoEngine, StyoEngineConfig } from '@styocss/core'

export interface StyoPluginContext {
	id: number
	engine: StyoEngine
	needToTransform: (id: string) => boolean
	styoFnNames: {
		normal: string
		normalpreview: string
		forceString: string
		forceStringPreview: string
		forceArray: string
		forceArrayPreview: string
		forceInline: string
		forceInlinePreview: string
	}
	transformedFormat: 'string' | 'array' | 'inline'
	usages: Map<string, (Parameters<StyoEngine['styo']>)[]>
	resolvedDtsPath: string | null
	hasVue: boolean
	generateDts: () => Promise<void>
	transformTsToJs: (jsCode: string) => Promise<string> | string
	currentPackageName: string
}

export interface PluginOptions {
	/**
	 * List of file extensions to be processed by the plugin.
	 * @default ['.vue', '.tsx', '.jsx']
	 */
	extensions?: string[]

	/**
	 * Configure the styo engine.
	 */
	config?: StyoEngineConfig

	/**
	 * Customize the name of the styo function.
	 * @default 'styo'
	 */
	styoFnName?: string

	/**
	 * Decide the format of the transformed result.
	 *
	 * - `string`: The transformed result will be a js string (e.g. `'a b c'`).
	 * - `array`: The transformed result will be a js array (e.g. `['a', 'b', 'c']`).
	 * - `inline`: The transformed result will be directly used in the code (e.g. `a b c`).
	 *
	 * @default 'array'
	 */
	transformedFormat?: 'string' | 'array' | 'inline'

	_transformTsToJs?: (tsCode: string) => Promise<string> | string
	_currentPackageName?: string
}
