import type { EnginePlugin } from '../plugin'
import type { AutocompleteConfig, ResolvedAutocompleteConfig } from './autocomplete'
import type { PreflightConfig, PreflightFn } from './preflight'

export interface EngineConfig {
	/**
	 * Register plugins to extend PikaCSS functionality.
	 *
	 * @example
	 * ```ts
	 * {
	 *   plugins: [
	 *     icons(), // Add icon support
	 *     customPlugin() // Custom plugin
	 *   ]
	 * }
	 * ```
	 */
	plugins?: EnginePlugin[]

	/**
	 * Set the prefix for generated atomic style id.
	 *
	 * @default ''
	 * @example
	 * ```ts
	 * {
	 *   prefix: 'pika-' // Generated atomic id will be 'pika-xxx'
	 * }
	 * ```
	 */
	prefix?: string

	/**
	 * Set the default selector format. '$$' will be replaced with the atomic style id.
	 *
	 * @default '.$$'
	 * @example
	 * ```ts
	 * {
	 *   defaultSelector: '.$$' // Use with class attribute: <div class="a b c">
	 *   // or
	 *   defaultSelector: '[data-pika~="$$"]' // Use with attribute selector: <div data-pika="a b c">
	 * }
	 * ```
	 */
	defaultSelector?: string

	/**
	 * Define global CSS styles that will be injected before atomic styles.
	 * Can be used for CSS variables, global animations, base styles, etc.
	 *
	 * @default []
	 * @example
	 * ```ts
	 * {
	 *   preflights: [
	 *     // Use CSS string directly
	 *     ':root { --color: blue }',
	 *     // Or use function to generate dynamically
	 *     (engine) => ':root { --theme: dark }'
	 *   ]
	 * }
	 * ```
	 */
	preflights?: PreflightConfig[]

	/**
	 * Configure autocomplete functionality, including suggestions for selectors,
	 * style item strings, extra properties, etc.
	 *
	 * @example
	 * ```ts
	 * {
	 *   autocomplete: {
	 *     selectors: ['hover', 'focus'],
	 *     styleItemStrings: ['flex-center'],
	 *     extraProperties: ['customProp'],
	 *     properties: [['color', 'string']]
	 *   }
	 * }
	 * ```
	 */
	autocomplete?: AutocompleteConfig
}

export interface ResolvedEngineConfig {
	rawConfig: EngineConfig
	prefix: string
	defaultSelector: string
	plugins: EnginePlugin[]
	preflights: PreflightFn[]
	autocomplete: ResolvedAutocompleteConfig
}
