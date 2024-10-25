import type { StyoEngine, StyoEngineConfig } from '@styocss/core'

export interface StyoPluginContext {
	engine: StyoEngine
	needToTransform: (id: string) => boolean
	transformTsToJs: (jsCode: string) => Promise<string> | string
	nameOfStyoFn: string
	autoJoin: boolean
	dts: false | string
	usages: Map<string, (Parameters<StyoEngine['styo']>)[]>
	resolvedDtsPath: string | null
	hasVue: boolean
	generateDts: () => Promise<void>
}

export interface StyoPluginOptions {
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
	 * Customize the name of the style function.
	 * @default '$s'
	 */
	nameOfStyoFn?: string

	/**
	 * Enable/disable the auto join of the generated atomic rule names with space.
	 * It is useful when you want to use the generated atomic rule names directly in a class attribute.
	 * @default false
	 */
	autoJoin?: boolean

	/**
	 * Enable/disable the generation of d.ts files.
	 * If a string is provided, it will be used as the path to the d.ts file.
	 * Default path is `<path to vite config>/styo.d.ts`.
	 * @default false
	 */
	dts?: boolean | string

	/**
	 * Function to transform the ts code to js code.
	 * Just ignore this option if you don't know what it is.
	 */
	transformTsToJs?: (tsCode: string) => Promise<string> | string
}
