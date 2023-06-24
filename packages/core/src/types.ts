import type * as CSS from 'csstype'

type Arrayable<T> = T | T[]

type PartialByKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

type CSSProperties = (CSS.Properties & CSS.PropertiesHyphen) extends infer Temp
  ? { [K in keyof Temp]: Temp[K] extends infer V ? V | (V extends undefined ? never : V)[] | undefined : never }
  : never
interface CSSVariables {
  [K: `--${string}`]: (string & {}) | number
}
interface Properties extends CSSProperties, CSSVariables {}

interface AtomicStyleContent {
  nested: string
  selector: string
  important: boolean
  property: string
  value: string | string[] | null | undefined
}

interface AddedAtomicStyle {
  name: string
  content: AtomicStyleContent
}

interface StaticAliasRule {
  key: string
  alias: string
  value: Arrayable<string>
}

interface DynamicAliasRule {
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
  AliasForNested extends string = string,
  AliasTemplateForNested extends string = string,
  AliasForSelector extends string = string,
  AliasTemplateForSelector extends string = string,
  Shortcut extends string = string,
  ShortcutTemplate extends string = string,
> extends Properties {
  $nested?: Arrayable<(string & {}) | (string extends AliasForNested ? never : AliasForNested) | (string extends AliasTemplateForNested ? never : AliasTemplateForNested)>
  $selector?: Arrayable<(string & {} | CSS.Pseudos) | (string extends AliasForSelector ? never : AliasForSelector) | (string extends AliasTemplateForSelector ? never : AliasTemplateForSelector)>
  $important?: boolean
  $apply?: Arrayable<(string & {}) | (string extends Shortcut ? never : Shortcut) | (string extends ShortcutTemplate ? never : ShortcutTemplate)>
}

type StyleItem<
  AliasForNested extends string = string,
  AliasTemplateForNested extends string = string,
  AliasForSelector extends string = string,
  AliasTemplateForSelector extends string = string,
  Shortcut extends string = string,
  ShortcutTemplate extends string = string,
> = Omit<(string & {}), keyof typeof String.prototype> | (string extends Shortcut ? never : Shortcut) | (string extends ShortcutTemplate ? never : ShortcutTemplate) | StyleGroup<AliasForNested, AliasTemplateForNested, AliasForSelector, AliasTemplateForSelector, Shortcut, ShortcutTemplate>

// Config
interface RuleConfig {
  type: string
}
interface StaticAliasRuleConfig extends RuleConfig, StaticAliasRule {
  type: 'static'
}
interface DynamicAliasRuleConfig extends RuleConfig, PartialByKeys<DynamicAliasRule, 'predefined' | 'template'> {
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
     * Alias rules for `$nested` property.
     *
     * @default []
     */
    nested?: (StaticAliasRuleConfig | DynamicAliasRuleConfig)[]
    /**
     * Alias rules for `$selector` property.
     *
     * @default []
     */
    selector?: (StaticAliasRuleConfig | DynamicAliasRuleConfig)[]
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
   * Default value for `$nested` property.
   *
   * @default ''
   */
  defaultNested?: string
  /**
   * Default value for `$selector` property.
   *
   * @default ''
   */
  defaultSelector?: string
  /**
   * Default value for `$important` property.
   *
   * @default false
   */
  defaultImportant?: boolean
}

interface ResolvedCommonConfig {
  aliasForNestedConfigList: (StaticAliasRuleConfig | DynamicAliasRuleConfig)[]
  aliasForSelectorConfigList: (StaticAliasRuleConfig | DynamicAliasRuleConfig)[]
  shortcutConfigList: (StaticShortcutRuleConfig | DynamicShortcutRuleConfig)[]
}

type ResolvedStyoEngineConfig = (Required<Omit<StyoEngineConfig, keyof CommonConfig>> & ResolvedCommonConfig) extends infer O
  ? { [K in keyof O]: O[K] }
  : never

export type {
  Properties,
  AtomicStyleContent,
  AddedAtomicStyle,
  StaticAliasRule,
  DynamicAliasRule,
  StaticShortcutRule,
  DynamicShortcutRule,
  ShortcutPartial,
  StyleGroup,
  StyleItem,
  StaticAliasRuleConfig,
  DynamicAliasRuleConfig,
  StaticShortcutRuleConfig,
  DynamicShortcutRuleConfig,
  CommonConfig,
  StyoPreset,
  StyoEngineConfig,
  ResolvedCommonConfig,
  ResolvedStyoEngineConfig,
}
