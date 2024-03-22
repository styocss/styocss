/* eslint-disable ts/ban-types */
import type * as CSS from 'csstype'
import type { DEFAULT_SELECTOR_PLACEHOLDER } from './constants'

type Arrayable<T> = T | T[]

type Prettify<T> = { [K in keyof T]: T[K] } & {}

type PartialByKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

type CSSProperties = (CSS.Properties & CSS.PropertiesHyphen) extends infer Temp
	? { [K in keyof Temp]: Temp[K] extends infer V ? V | (V extends undefined ? never : V)[] | undefined : never }
	: never
interface CSSVariables {
	[K: `--${string}`]: (string & {}) | number
}
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
	key: string
	alias: string
	value: Arrayable<Arrayable<string>>
}

interface DynamicNestingAliasRule {
	key: string
	pattern: RegExp
	createValue: (matched: RegExpMatchArray) => Arrayable<Arrayable<string>>
	predefined: Arrayable<string>
	template: Arrayable<string>
}

interface StaticSelectorAliasRule {
	key: string
	alias: string
	value: Arrayable<string>
}

interface DynamicSelectorAliasRule {
	key: string
	pattern: RegExp
	createValue: (matched: RegExpMatchArray) => Arrayable<string>
	predefined: Arrayable<string>
	template: Arrayable<string>
}

interface StaticShortcutRule {
	key: string
	name: string
	partials: ShortcutPartial[]
}

interface DynamicShortcutRule {
	key: string
	pattern: RegExp
	createPartials: (matched: RegExpMatchArray) => ShortcutPartial[]
	predefined: Arrayable<string>
	template: Arrayable<string>
}

type ShortcutPartial = StyleItem

interface StyleGroup<
  AliasForNesting extends string = string,
  AliasTemplateForNesting extends string = string,
  AliasForSelector extends string = string,
  AliasTemplateForSelector extends string = string,
  Shortcut extends string = string,
  ShortcutTemplate extends string = string,
> extends Properties {
	$nesting?: Arrayable<(string & {}) | (string extends AliasForNesting ? never : AliasForNesting) | (string extends AliasTemplateForNesting ? never : AliasTemplateForNesting) | /* Multi Level Nesting */ string[]>
	$selector?: Arrayable<(string & {} | `${typeof DEFAULT_SELECTOR_PLACEHOLDER}${CSS.Pseudos}`) | (string extends AliasForSelector ? never : AliasForSelector) | (string extends AliasTemplateForSelector ? never : AliasTemplateForSelector)>
	$important?: boolean
	$apply?: Arrayable<(string & {}) | (string extends Shortcut ? never : Shortcut) | (string extends ShortcutTemplate ? never : ShortcutTemplate)>
}

type StyleItem<
  AliasForNesting extends string = string,
  AliasTemplateForNesting extends string = string,
  AliasForSelector extends string = string,
  AliasTemplateForSelector extends string = string,
  Shortcut extends string = string,
  ShortcutTemplate extends string = string,
> = Omit<(string & {}), keyof typeof String.prototype> | (string extends Shortcut ? never : Shortcut) | (string extends ShortcutTemplate ? never : ShortcutTemplate) | StyleGroup<AliasForNesting, AliasTemplateForNesting, AliasForSelector, AliasTemplateForSelector, Shortcut, ShortcutTemplate>

// Config
interface RuleConfig {
	type: string
}
interface StaticNestingAliasRuleConfig extends RuleConfig, StaticNestingAliasRule {
	type: 'static'
}
interface DynamicNestingAliasRuleConfig extends RuleConfig, PartialByKeys<DynamicNestingAliasRule, 'predefined' | 'template'> {
	type: 'dynamic'
}
interface StaticSelectorAliasRuleConfig extends RuleConfig, StaticSelectorAliasRule {
	type: 'static'
}
interface DynamicSelectorAliasRuleConfig extends RuleConfig, PartialByKeys<DynamicSelectorAliasRule, 'predefined' | 'template'> {
	type: 'dynamic'
}
interface StaticShortcutRuleConfig extends RuleConfig, StaticShortcutRule {
	type: 'static'
}
interface DynamicShortcutRuleConfig extends RuleConfig, PartialByKeys<DynamicShortcutRule, 'predefined' | 'template'> {
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
