import type { StyoEngine, StyoEngineConfig, createEventHook } from '@styocss/core'

export interface StyoUsage {
	isPreview: boolean
	params: Parameters<StyoEngine['styo']>
}

export interface StyoPluginContext {
	currentPackageName: string
	transformTsToJs: (jsCode: string) => Promise<string> | string
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
	dts: false | string
	resolvedDtsPath: string | null
	hasVue: boolean
	usages: Map<string, StyoUsage[]>
	hooks: {
		updateDts: ReturnType<typeof createEventHook<void>>
	}

	isReady: Promise<void>
	ready: () => void
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

	/**
	 * Enable/disable the generation of d.ts files.
	 * If a string is provided, it will be used as the path to the d.ts file.
	 * Default path is `<path to vite config>/styo.d.ts`.
	 * @default false
	 */
	dts?: boolean | string

	/** @internal */
	transformTsToJs?: (tsCode: string) => Promise<string> | string

	/** @internal */
	currentPackageName?: string
}
