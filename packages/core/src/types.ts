import type * as CSS from 'csstype'
import type { Arrayable, PartialByKeys } from '@styocss/shared'

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

interface StaticAliasRule<Alias extends string> {
  key: string
  alias: Alias
  value: Arrayable<string>
}

interface DynamicAliasRule<Alias extends string> {
  key: string
  pattern: RegExp
  predefinedList: Alias[]
  createValue: (matched: RegExpMatchArray) => Arrayable<string>
}

interface StaticShortcutRule<
  AliasForNested extends string,
  AliasTemplateForNested extends string,
  AliasForSelector extends string,
  AliasTemplateForSelector extends string,
  Shortcut extends string,
  ShortcutTemplate extends string,
> {
  key: string
  name: Shortcut
  partials: ShortcutPartial<AliasForNested, AliasTemplateForNested, AliasForSelector, AliasTemplateForSelector, Shortcut, ShortcutTemplate>[]
}

interface DynamicShortcutRule<
  AliasForNested extends string,
  AliasTemplateForNested extends string,
  AliasForSelector extends string,
  AliasTemplateForSelector extends string,
  Shortcut extends string,
  ShortcutTemplate extends string,
> {
  key: string
  pattern: RegExp
  predefinedList: Shortcut[]
  createPartials: (matched: RegExpMatchArray) => ShortcutPartial<AliasForNested, AliasTemplateForNested, AliasForSelector, AliasTemplateForSelector, Shortcut, ShortcutTemplate>[]
}

type ShortcutPartial<
  AliasForNested extends string,
  AliasTemplateForNested extends string,
  AliasForSelector extends string,
  AliasTemplateForSelector extends string,
  Shortcut extends string,
  ShortcutTemplate extends string,
> = StyleItem<AliasForNested, AliasTemplateForNested, AliasForSelector, AliasTemplateForSelector, Shortcut, ShortcutTemplate>
interface StyleGroup<
  AliasForNested extends string,
  AliasTemplateForNested extends string,
  AliasForSelector extends string,
  AliasTemplateForSelector extends string,
  Shortcut extends string,
  ShortcutTemplate extends string,
> extends Properties {
  $nested?: Arrayable<(string & {}) | (string extends AliasForNested ? never : AliasForNested) | (string extends AliasTemplateForNested ? never : AliasTemplateForNested)>
  $selector?: Arrayable<(string & {} | CSS.Pseudos) | (string extends AliasForSelector ? never : AliasForSelector) | (string extends AliasTemplateForSelector ? never : AliasTemplateForSelector)>
  $important?: boolean
  $apply?: Arrayable<(string & {}) | (string extends Shortcut ? never : Shortcut) | (string extends ShortcutTemplate ? never : ShortcutTemplate)>
}

type StyleItem<
  AliasForNested extends string,
  AliasTemplateForNested extends string,
  AliasForSelector extends string,
  AliasTemplateForSelector extends string,
  Shortcut extends string,
  ShortcutTemplate extends string,
> = Omit<(string & {}), keyof typeof String.prototype> | (string extends Shortcut ? never : Shortcut) | (string extends ShortcutTemplate ? never : ShortcutTemplate) | StyleGroup<AliasForNested, AliasTemplateForNested, AliasForSelector, AliasTemplateForSelector, Shortcut, ShortcutTemplate>

// Config
interface RuleConfig {
  type: string
}
interface StaticAliasRuleConfig<Alias extends string = string> extends RuleConfig, StaticAliasRule<Alias> {
  type: 'static'
  description?: string
}
interface DynamicAliasRuleConfig<
  Alias extends string = string,
  AliasTemplate extends string = string,
> extends RuleConfig, PartialByKeys<DynamicAliasRule<Alias>, 'predefinedList'> {
  type: 'dynamic'
  description?: string
  template?: Arrayable<AliasTemplate>
}
interface StaticShortcutRuleConfig<
  AliasForNested extends string = string,
  AliasTemplateForNested extends string = string,
  AliasForSelector extends string = string,
  AliasTemplateForSelector extends string = string,
  Shortcut extends string = string,
  ShortcutTemplate extends string = string,
> extends RuleConfig, StaticShortcutRule<AliasForNested, AliasTemplateForNested, AliasForSelector, AliasTemplateForSelector, Shortcut, ShortcutTemplate> {
  type: 'static'
  description?: string
}
interface DynamicShortcutRuleConfig<
  AliasForNested extends string = string,
  AliasTemplateForNested extends string = string,
  AliasForSelector extends string = string,
  AliasTemplateForSelector extends string = string,
  Shortcut extends string = string,
  ShortcutTemplate extends string = string,
> extends RuleConfig, PartialByKeys<DynamicShortcutRule<AliasForNested, AliasTemplateForNested, AliasForSelector, AliasTemplateForSelector, Shortcut, ShortcutTemplate>, 'predefinedList'> {
  type: 'dynamic'
  description?: string
  template?: Arrayable<ShortcutTemplate>
}
interface CommonConfig<
  AliasForNested extends string,
  AliasTemplateForNested extends string,
  AliasForSelector extends string,
  AliasTemplateForSelector extends string,
  Shortcut extends string,
  ShortcutTemplate extends string,
> {
  /**
   * Preset list.
   */
  presets?: StyoPreset<AliasForNested, AliasTemplateForNested, AliasForSelector, AliasTemplateForSelector, Shortcut, ShortcutTemplate>[]
  /**
   * Aliases config.
   */
  aliases?: {
    /**
     * Alias rules for `$nested` property.
     *
     * @default []
     */
    nested?: (StaticAliasRuleConfig<AliasForNested> | DynamicAliasRuleConfig<AliasForNested>)[]
    /**
     * Alias rules for `$selector` property.
     *
     * @default []
     */
    selector?: (StaticAliasRuleConfig<AliasForSelector> | DynamicAliasRuleConfig<AliasForSelector>)[]
  }
  /**
   * Shortcut rules.
   *
   * @default []
   */
  shortcuts?: (
    | StaticShortcutRuleConfig<AliasForNested, AliasTemplateForNested, AliasForSelector, AliasTemplateForSelector, Shortcut, ShortcutTemplate>
    | DynamicShortcutRuleConfig<AliasForNested, AliasTemplateForNested, AliasForSelector, AliasTemplateForSelector, Shortcut, ShortcutTemplate>
  )[]
}

interface StyoPreset<
  AliasForNested extends string = string,
  AliasTemplateForNested extends string = string,
  AliasForSelector extends string = string,
  AliasTemplateForSelector extends string = string,
  Shortcut extends string = string,
  ShortcutTemplate extends string = string,
> extends CommonConfig<AliasForNested, AliasTemplateForNested, AliasForSelector, AliasTemplateForSelector, Shortcut, ShortcutTemplate> {
  /**
   * Name of preset.
   */
  name: string
}

interface StyoEngineConfig<
  AliasForNested extends string = string,
  AliasTemplateForNested extends string = string,
  AliasForSelector extends string = string,
  AliasTemplateForSelector extends string = string,
  Shortcut extends string = string,
  ShortcutTemplate extends string = string,
> extends CommonConfig<AliasForNested, AliasTemplateForNested, AliasForSelector, AliasTemplateForSelector, Shortcut, ShortcutTemplate> {
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

interface ResolvedCommonConfig<
  AliasForNested extends string,
  AliasTemplateForNested extends string,
  AliasForSelector extends string,
  AliasTemplateForSelector extends string,
  Shortcut extends string,
  ShortcutTemplate extends string,
> {
  aliasForNestedConfigList: (StaticAliasRuleConfig<AliasForNested> | DynamicAliasRuleConfig<AliasForNested>)[]
  aliasForSelectorConfigList: (StaticAliasRuleConfig<AliasForSelector> | DynamicAliasRuleConfig<AliasForSelector>)[]
  shortcutConfigList: (StaticShortcutRuleConfig<AliasForNested, AliasTemplateForNested, AliasForSelector, AliasTemplateForSelector, Shortcut, ShortcutTemplate> | DynamicShortcutRuleConfig<AliasForNested, AliasTemplateForNested, AliasForSelector, AliasTemplateForSelector, Shortcut, ShortcutTemplate>)[]
}

type ResolvedStyoEngineConfig<
  AliasForNested extends string,
  AliasTemplateForNested extends string,
  AliasForSelector extends string,
  AliasTemplateForSelector extends string,
  Shortcut extends string,
  ShortcutTemplate extends string,
> = (Required<Omit<StyoEngineConfig<AliasForNested, AliasTemplateForNested, AliasForSelector, AliasTemplateForSelector, Shortcut, ShortcutTemplate>, keyof CommonConfig<AliasForNested, AliasTemplateForNested, AliasForSelector, AliasTemplateForSelector, Shortcut, ShortcutTemplate>>> & ResolvedCommonConfig<AliasForNested, AliasTemplateForNested, AliasForSelector, AliasTemplateForSelector, Shortcut, ShortcutTemplate>) extends infer O
  ? {
      [K in keyof O]: O[K]
    }
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
