import type * as CSS from 'csstype'
import type { DEFAULT_SELECTOR_PLACEHOLDER } from './constants'

type Arrayable<T> = T | T[]

type Prettify<T> = { [K in keyof T]: T[K] } & {}

type PartialByKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

type CSSProperties = (CSS.Properties & CSS.PropertiesHyphen) extends infer _ ? { [K in keyof _]: _[K] extends infer V ? V | (V extends undefined ? never : V)[] | undefined : never } : never
type CSSVariables = Record<`--${string}`, (string & {}) | number>
interface Properties extends CSSProperties, CSSVariables {}

interface AtomicStyleContent {
	nesting: string[]
	selector: string
	important: boolean
	property: string
	value: string | string[] | null | undefined
}

interface AddedAtomicStyle {
	name: string
	content: AtomicStyleContent
}

interface StaticNestingAliasRule {
	alias: string
	value: Arrayable<Arrayable<string>>
}

interface DynamicNestingAliasRule {
	pattern: RegExp
	createValue: (matched: RegExpMatchArray) => Arrayable<Arrayable<string>>
	predefined: Arrayable<string>
}

interface StaticSelectorAliasRule {
	alias: string
	value: Arrayable<string>
}

interface DynamicSelectorAliasRule {
	pattern: RegExp
	createValue: (matched: RegExpMatchArray) => Arrayable<string>
	predefined: Arrayable<string>
}

interface StaticShortcutRule {
	name: string
	partials: ShortcutPartial[]
}

interface DynamicShortcutRule {
	pattern: RegExp
	createPartials: (matched: RegExpMatchArray) => ShortcutPartial[]
	predefined: Arrayable<string>
}

type ShortcutPartial = StyleItem

interface StyleGroup<
	AliasForNesting extends string = string,
	AliasForSelector extends string = string,
	Shortcut extends string = string,
> extends Properties {
	$nesting?: Arrayable<Arrayable<(string & {}) | (string extends AliasForNesting ? never : AliasForNesting)>>
	$selector?: Arrayable<(string & {} | `${typeof DEFAULT_SELECTOR_PLACEHOLDER}${CSS.Pseudos}`) | (string extends AliasForSelector ? never : AliasForSelector)>
	$important?: boolean
	$apply?: Arrayable<(string & {}) | (string extends Shortcut ? never : Shortcut)>
}

type StyleItem<
	AliasForNesting extends string = string,
	AliasForSelector extends string = string,
	Shortcut extends string = string,
> = Shortcut | StyleGroup<AliasForNesting, AliasForSelector, Shortcut>

type _StyleDefinition<
	Selector extends string = string,
	MaxDepth extends number = 5,
	Result extends any[] = [],
> = Result extends { length: MaxDepth }
	? (Result[number] | Properties)
	: Result extends []
		? _StyleDefinition<Selector, MaxDepth, [Record<Selector, Properties>]>
		: _StyleDefinition<Selector, MaxDepth, [Record<Selector, Result[0]>, ...Result]>

type StyleDefinition<Selector extends string = string> = _StyleDefinition<Selector>

// Config
interface RuleConfig {
	type: string
}
interface StaticNestingAliasRuleConfig extends RuleConfig, StaticNestingAliasRule {
	type: 'static'
}
interface DynamicNestingAliasRuleConfig extends RuleConfig, PartialByKeys<DynamicNestingAliasRule, 'predefined'> {
	type: 'dynamic'
}
interface StaticSelectorAliasRuleConfig extends RuleConfig, StaticSelectorAliasRule {
	type: 'static'
}
interface DynamicSelectorAliasRuleConfig extends RuleConfig, PartialByKeys<DynamicSelectorAliasRule, 'predefined'> {
	type: 'dynamic'
}
interface StaticShortcutRuleConfig extends RuleConfig, StaticShortcutRule {
	type: 'static'
}
interface DynamicShortcutRuleConfig extends RuleConfig, PartialByKeys<DynamicShortcutRule, 'predefined'> {
	type: 'dynamic'
}
interface CommonConfig {
	/**
	 * Preset list.
	 */
	presets?: StyoPreset[]
	/**
	 * Aliases config.
	 */
	aliases?: {
		/**
		 * Alias rules for `$nesting` property.
		 *
		 * @default []
		 */
		nesting?: (StaticNestingAliasRuleConfig | DynamicNestingAliasRuleConfig)[]
		/**
		 * Alias rules for `$selector` property.
		 *
		 * @default []
		 */
		selector?: (StaticSelectorAliasRuleConfig | DynamicSelectorAliasRuleConfig)[]
	}
	/**
	 * Shortcut rules.
	 *
	 * @default []
	 */
	shortcuts?: (StaticShortcutRuleConfig | DynamicShortcutRuleConfig)[]
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
	 * Default value for `$nesting` property.
	 *
	 * @default []
	 */
	defaultNesting?: Arrayable<Arrayable<string>>
	/**
	 * Default value for `$selector` property. (`'$'` will be replaced with the atomic style name.)
	 *
	 * @example '.$' - Usage in class attribute: `<div class="a b c">`
	 * @example '[data-styo="$"]' - Usage in attribute selector: `<div data-styo="a b c">`
	 * @default '.$'
	 */
	defaultSelector?: Arrayable<string>
	/**
	 * Default value for `$important` property.
	 *
	 * @default false
	 */
	defaultImportant?: boolean
}

interface ResolvedCommonConfig {
	aliasForNestingConfigList: (StaticNestingAliasRuleConfig | DynamicNestingAliasRuleConfig)[]
	aliasForSelectorConfigList: (StaticSelectorAliasRuleConfig | DynamicSelectorAliasRuleConfig)[]
	shortcutConfigList: (StaticShortcutRuleConfig | DynamicShortcutRuleConfig)[]
}

interface ResolvedStyoEngineConfig extends ResolvedCommonConfig {
	prefix: string
	defaultNesting: string[][]
	defaultSelector: string[]
	defaultImportant: boolean
}

export type {
	Arrayable,
	Prettify,
	Properties,
	AtomicStyleContent,
	AddedAtomicStyle,
	StaticNestingAliasRule,
	DynamicNestingAliasRule,
	StaticSelectorAliasRule,
	DynamicSelectorAliasRule,
	StaticShortcutRule,
	DynamicShortcutRule,
	ShortcutPartial,
	StyleGroup,
	StyleItem,
	StyleDefinition,
	StaticNestingAliasRuleConfig,
	DynamicNestingAliasRuleConfig,
	StaticSelectorAliasRuleConfig,
	DynamicSelectorAliasRuleConfig,
	StaticShortcutRuleConfig,
	DynamicShortcutRuleConfig,
	CommonConfig,
	StyoPreset,
	StyoEngineConfig,
	ResolvedCommonConfig,
	ResolvedStyoEngineConfig,
}
