import type { Engine } from './engine'
import type { EnginePlugin } from './plugin'
import type { Arrayable, Awaitable, UnionString } from './util-types'

export type PropertyValue = string | number | [value: string | number, fallback: (string | number)[]] | null | undefined

export type Properties = Record<string, PropertyValue>

export interface StyleDefinition {
	[K: string]: PropertyValue | StyleDefinition | StyleItem[]
}

export type StyleItem = string | StyleDefinition

export interface ExtractedAtomicStyleContent {
	selector: string[]
	property: string
	value: string[] | null | undefined
}

export interface AtomicStyleContent {
	selector: string[]
	property: string
	value: string[]
}

export interface AtomicStyle {
	name: string
	content: AtomicStyleContent
}

export type PreflightFn = (engine: Engine) => string

export type PreflightConfig = string | PreflightFn

export interface AutocompleteConfig {
	selectors?: string[]
	styleItemStrings?: string[]
	extraProperties?: string[]
	extraCssProperties?: string[]
	properties?: [property: string, tsType: Arrayable<string>][]
	cssProperties?: [property: string, value: Arrayable<string | number>][]
}

export interface ResolvedAutocompleteConfig {
	selectors: Set<string>
	styleItemStrings: Set<string>
	extraProperties: Set<string>
	extraCssProperties: Set<string>
	properties: Map<string, string[]>
	cssProperties: Map<string, (string | number)[]>
}

export interface ImportantConfig {
	default?: boolean
}

export interface VariableAutocomplete<_CSSProperty extends string = string> {
	/**
	 * Specify the properties that the variable can be used as a value of.
	 *
	 * @default ['*']
	 */
	asValueOf?: Arrayable<UnionString | '*' | _CSSProperty>
	/**
	 * Whether to add the variable as a CSS property.
	 *
	 * @default true
	 */
	asProperty?: boolean
}

export type VariableConfig<_CSSProperty extends string = string> =
	| string
	| [name: string, value?: string, autocomplete?: VariableAutocomplete<_CSSProperty>]
	| { name: string, value?: string, autocomplete?: VariableAutocomplete<_CSSProperty> }

export interface Frames<_Properties = Properties> {
	from: _Properties
	to: _Properties
	[K: `${number}%`]: _Properties
}

export type KeyframesConfig<_Properties = Properties> =
	| string
	| [name: string, frames?: Frames<_Properties>, autocomplete?: string[]]
	| { name: string, frames?: Frames<_Properties>, autocomplete?: string[] }

export type SelectorConfig<_Selector extends string = string> =
	| string
	| [selector: RegExp, value: (matched: RegExpMatchArray) => Awaitable<Arrayable<UnionString | _Selector>>, autocomplete?: Arrayable<string>]
	| [selector: string, value: Arrayable<UnionString | _Selector>]
	| {
		selector: RegExp
		value: (matched: RegExpMatchArray) => Awaitable<Arrayable<UnionString | _Selector>>
		autocomplete?: Arrayable<string>
	}
	| {
		selector: string
		value: Arrayable<UnionString | _Selector>
	}

export type ShortcutConfig<_StyleItem = StyleItem> =
	| string
	| [shortcut: RegExp, value: (matched: RegExpMatchArray) => Awaitable<Arrayable<_StyleItem>>, autocomplete?: Arrayable<string>]
	| {
		shortcut: RegExp
		value: (matched: RegExpMatchArray) => Awaitable<Arrayable<_StyleItem>>
		autocomplete?: Arrayable<string>
	}
	| [shortcut: string, value: Arrayable<_StyleItem>]
	| {
		shortcut: string
		value: Arrayable<_StyleItem>
	}

export interface EngineConfig<
	_Plugins extends EnginePlugin[] = EnginePlugin[],
	_Selector extends string = string,
	_CSSProperty extends string = string,
	_Properties = Properties,
	_StyleDefinition = StyleDefinition,
	_StyleItem = StyleItem,
> {
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
	plugins?: [..._Plugins]

	/**
	 * Set the prefix for generated atomic class names.
	 *
	 * @default ''
	 * @example
	 * ```ts
	 * {
	 *   prefix: 'pika-' // Generated class names will be like 'pika-xxx'
	 * }
	 * ```
	 */
	prefix?: string

	/**
	 * Set the default selector format. '&&' will be replaced with the atomic style name.
	 *
	 * @default '.&&'
	 * @example
	 * ```ts
	 * {
	 *   defaultSelector: '.&&' // Use class attribute: <div class="a b c">
	 *   // or
	 *   defaultSelector: '[data-pika~="&&"]' // Use attribute selector: <div data-pika="a b c">
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

	/**
	 * Configure !important usage.
	 *
	 * @default { default: false }
	 * @example
	 * ```ts
	 * {
	 *   important: {
	 *     default: true // All styles will be marked as !important
	 *   }
	 * }
	 * ```
	 */
	important?: ImportantConfig

	/**
	 * Set the prefix for CSS variables.
	 *
	 * @example
	 * ```ts
	 * {
	 *   variablesPrefix: 'theme',
	 *   variables: [['color', 'blue']] // Generates: --theme-color: blue
	 * }
	 * ```
	 */
	variablesPrefix?: string

	/**
	 * Define CSS variables with support for static values and autocomplete configuration.
	 *
	 * @default []
	 * @example
	 * ```ts
	 * {
	 *   variables: [
	 *     // Basic usage
	 *     ['primary', '#ff0000'],
	 *     // With autocomplete configuration
	 *     ['accent', '#00ff00', {
	 *       asValueOf: ['color', 'background-color'],
	 *       asProperty: true
	 *     }]
	 *   ]
	 * }
	 * ```
	 */
	variables?: VariableConfig<_CSSProperty>[]

	/**
	 * Define CSS @keyframes animations with support for frame definitions
	 * and autocomplete suggestions.
	 *
	 * @default []
	 * @example
	 * ```ts
	 * {
	 *   keyframes: [
	 *     // Basic animation
	 *     ['fade', {
	 *       from: { opacity: 0 },
	 *       to: { opacity: 1 }
	 *     }],
	 *     // With autocomplete suggestions
	 *     ['slide', {
	 *       from: { transform: 'translateX(-100%)' },
	 *       to: { transform: 'translateX(0)' }
	 *     }, ['slide 0.3s ease']]
	 *   ]
	 * }
	 * ```
	 */
	keyframes?: KeyframesConfig<_Properties>[]

	/**
	 * Define selector transformation rules with support for static and dynamic rules.
	 *
	 * @default []
	 * @example
	 * ```ts
	 * {
	 *   selectors: [
	 *     // Static selector
	 *     ['hover', '&:hover'],
	 *     // Dynamic selector
	 *     [/^screen-(\d+)$/, m => `@media (min-width: ${m[1]}px)`,
	 *       ['screen-768', 'screen-1024']], // Autocomplete suggestions
	 *   ]
	 * }
	 * ```
	 */
	selectors?: SelectorConfig<_Selector>[]

	/**
	 * Define style shortcuts for reusable style combinations.
	 *
	 * @default []
	 * @example
	 * ```ts
	 * {
	 *   shortcuts: [
	 *     // Static shortcut
	 *     ['flex-center', {
	 *       display: 'flex',
	 *       alignItems: 'center',
	 *       justifyContent: 'center'
	 *     }],
	 *     // Dynamic shortcut
	 *     [/^m-(\d+)$/, m => ({ margin: `${m[1]}px` }),
	 *       ['m-4', 'm-8']] // Autocomplete suggestions
	 *   ]
	 * }
	 * ```
	 */
	shortcuts?: ShortcutConfig<_StyleItem>[]

	[key: string]: any
}

export interface ResolvedEngineConfig {
	rawConfig: EngineConfig
	prefix: string
	defaultSelector: string
	plugins: EnginePlugin[]
	preflights: PreflightFn[]
	autocomplete: ResolvedAutocompleteConfig
}
