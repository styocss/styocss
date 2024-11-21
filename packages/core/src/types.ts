import type * as CSS from 'csstype'

type Arrayable<T> = T | T[]

type Prettify<T> = { [K in keyof T]: T[K] } & {}

type CSSProperties = (CSS.Properties & CSS.PropertiesHyphen) extends infer _ ? { [K in keyof _]: _[K] extends infer V ? V | (V extends undefined ? never : V)[] | undefined : never } : never
type CSSVariables = Record<`--${string}`, (string & {}) | number>
interface Properties extends CSSProperties, CSSVariables {}

interface AtomicStyleContent {
	selector: string[]
	property: string
	value: string | string[] | null | undefined
}

interface AddedAtomicStyle {
	name: string
	content: AtomicStyleContent
}

type _StyleObj<
	Selector extends string = string,
	MaxDepth extends number = 5,
	Result extends any[] = [],
> = Result extends { length: MaxDepth }
	? (Result[number] | Properties)
	: Result extends []
		? _StyleObj<Selector, MaxDepth, [Record<Selector, Properties>]>
		: _StyleObj<Selector, MaxDepth, [Record<Selector, Result[0]>, ...Result]>

type StyleObj<Selector extends string = string> = _StyleObj<Selector>

type StyleItem<
	AliasForSelector extends string = string,
	Shortcut extends string = string,
> = Shortcut | StyleObj<(string & {}) | AliasForSelector>

// Config

interface StaticSelectorAliasRule {
	alias: string
	value: Arrayable<string>
}

interface DynamicSelectorAliasRule {
	pattern: RegExp
	createValue: (matched: RegExpMatchArray) => Arrayable<string>
	predefined: Arrayable<string>
}

type ShortcutPartial = StyleItem

interface StaticShortcutRule {
	name: string
	partials: ShortcutPartial[]
}

interface DynamicShortcutRule {
	pattern: RegExp
	createPartials: (matched: RegExpMatchArray) => ShortcutPartial[]
	predefined: Arrayable<string>
}
interface CommonConfig {
	/**
	 * Preset list.
	 */
	presets?: StyoPreset[]
	/**
	 * Alias rules for `$selector` property.
	 *
	 * @default []
	 */
	selectors?: {
		static?: StaticSelectorAliasRule[]
		dynamic?: DynamicSelectorAliasRule[]
	}
	/**
	 * Shortcut rules.
	 *
	 * @default []
	 */
	shortcuts?: {
		static?: StaticShortcutRule[]
		dynamic?: DynamicShortcutRule[]
	}
}

interface StyoPreset extends CommonConfig {
	/**
	 * Name of preset.
	 */
	name: string
}

interface StyoEngineConfig extends CommonConfig {
	/**
	 * Prefix for atomic style name.
	 *
	 * @default ''
	 */
	prefix?: string
	/**
	 * Default value for `$selector` property. (`'$'` will be replaced with the atomic style name.)
	 *
	 * @example '.$' - Usage in class attribute: `<div class="a b c">`
	 * @example '[data-styo="$"]' - Usage in attribute selector: `<div data-styo="a b c">`
	 * @default '.$'
	 */
	defaultSelector?: string
}

interface ResolvedCommonConfig {
	selectors: {
		static: StaticSelectorAliasRule[]
		dynamic: DynamicSelectorAliasRule[]
	}
	shortcuts: {
		static: StaticShortcutRule[]
		dynamic: DynamicShortcutRule[]
	}
}

interface ResolvedStyoEngineConfig extends ResolvedCommonConfig {
	prefix: string
	defaultSelector: string
}

export type {
	Arrayable,
	Prettify,
	Properties,
	AtomicStyleContent,
	AddedAtomicStyle,
	StaticSelectorAliasRule,
	DynamicSelectorAliasRule,
	StaticShortcutRule,
	DynamicShortcutRule,
	StyleObj,
	StyleItem,
	ShortcutPartial,
	CommonConfig,
	StyoPreset,
	StyoEngineConfig,
	ResolvedCommonConfig,
	ResolvedStyoEngineConfig,
}
