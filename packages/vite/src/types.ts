import type { EngineConfig, Nullish } from '@pikacss/integration'

export interface PluginOptions {
	/**
	 * Patterns of files to be transformed if they are matched.
	 * @default ['**‎/*.vue', '**‎/*.tsx', '**‎/*.jsx']
	 */
	target?: string[]

	/**
	 * Configure the pika engine.
	 */
	config?: EngineConfig | string

	/**
	 * Customize the name of the pika function.
	 * @default 'pika'
	 */
	fnName?: string

	/**
	 * Decide the format of the transformed result.
	 *
	 * - `string`: The transformed result will be a js string (e.g. `'a b c'`).
	 * - `array`: The transformed result will be a js array (e.g. `['a', 'b', 'c']`).
	 * - `inline`: The transformed result will be directly used in the code (e.g. `a b c`).
	 *
	 * @default 'string'
	 */
	transformedFormat?: 'string' | 'array' | 'inline'

	/**
	 * Enable/disable the generation of d.ts files.
	 * If a string is provided, it will be used as the path to the d.ts file.
	 * Default path is `<path to vite config>/pika.d.ts`.
	 * @default false
	 */
	tsCodegen?: boolean | string

	/**
	 * Path to the dev css file.
	 * @default 'pika.dev.css'
	 */
	devCss?: string

	/**
	 * Automatically create a pika config file if it doesn't exist and without inline config.
	 *
	 * @default true
	 */
	autoCreateConfig?: boolean

	/** @internal */
	currentPackageName?: string
}

export interface ResolvedPluginOptions {
	currentPackageName: string
	configOrPath: EngineConfig | string | Nullish
	tsCodegen: false | string
	devCss: string
	target: string[]
	fnName: string
	transformedFormat: 'string' | 'array' | 'inline'
	transformTsToJs: (tsCode: string) => Promise<string> | string
	autoCreateConfig: boolean
}
