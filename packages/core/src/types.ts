import type * as CSS from 'csstype'

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
  value: string
}

interface DynamicAliasRule<Alias extends string> {
  key: string
  pattern: RegExp
  exampleList: Alias[]
  createValue: (matched: RegExpMatchArray) => string
}

interface StaticMacroStyleRule<
  AliasForNested extends string,
  AliasForSelector extends string,
  MacroStyleName extends string,
> {
  key: string
  name: MacroStyleName
  partials: MacroStylePartial<AliasForNested, AliasForSelector, MacroStyleName>[]
}

interface DynamicMacroStyleRule<
  AliasForNested extends string,
  AliasForSelector extends string,
  MacroStyleName extends string,
> {
  key: string
  pattern: RegExp
  exampleList: MacroStyleName[]
  createPartials: (matched: RegExpMatchArray) => MacroStylePartial<AliasForNested, AliasForSelector, MacroStyleName>[]
}

type MacroStylePartial<
  AliasForNested extends string,
  AliasForSelector extends string,
  MacroStyleName extends string,
> = StyleItem<AliasForNested, AliasForSelector, MacroStyleName>
interface StyleGroup<
  AliasForNested extends string,
  AliasForSelector extends string,
  MacroStyleName extends string,
> extends Properties {
  $nested?: (string & {}) | (string extends AliasForNested ? never : AliasForNested)
  $selector?: (string & {} | CSS.Pseudos) | (string extends AliasForSelector ? never : AliasForSelector)
  $important?: boolean
  $apply?: ((string & {}) | (string extends MacroStyleName ? never : MacroStyleName))[]
}

type StyleItem<
  AliasForNested extends string,
  AliasForSelector extends string,
  MacroStyleName extends string,
> = Omit<(string & {}), keyof typeof String.prototype> | (string extends MacroStyleName ? never : MacroStyleName) | StyleGroup<AliasForNested, AliasForSelector, MacroStyleName>

// Config
interface RuleConfig {
  type: string
}
interface StaticAlaisRuleConfig<Alias extends string> extends RuleConfig, StaticAliasRule<Alias> {
  type: 'static'
}
interface DynamicAlaisRuleConfig<Alias extends string> extends RuleConfig, DynamicAliasRule<Alias> {
  type: 'dynamic'
}
interface StaticMacroStyleRuleConfig<
  AliasForNested extends string,
  AliasForSelector extends string,
  MacroStyleName extends string,
> extends RuleConfig, StaticMacroStyleRule<AliasForNested, AliasForSelector, MacroStyleName> {
  type: 'static'
}
interface DynamicMacroStyleRuleConfig<
  AliasForNested extends string,
  AliasForSelector extends string,
  MacroStyleName extends string,
> extends RuleConfig, DynamicMacroStyleRule<AliasForNested, AliasForSelector, MacroStyleName> {
  type: 'dynamic'
}
interface CommonConfig<
  AliasForNested extends string,
  AliasForSelector extends string,
  MacroStyleName extends string,
> {
  /**
   * Preset list.
   */
  presets?: PresetConfig<AliasForNested, AliasForSelector, MacroStyleName>[]
  /**
   * Aliases config.
   */
  aliases?: {
    /**
     * Alias rules for `$nested` property.
     *
     * @default []
     */
    nested?: (StaticAlaisRuleConfig<AliasForNested> | DynamicAlaisRuleConfig<AliasForNested>)[]
    /**
     * Alias rules for `$selector` property.
     *
     * @default []
     */
    selector?: (StaticAlaisRuleConfig<AliasForSelector> | DynamicAlaisRuleConfig<AliasForSelector>)[]
  }
  /**
   * Macro style rules.
   *
   * @default []
   */
  macroStyles?: (StaticMacroStyleRuleConfig<AliasForNested, AliasForSelector, MacroStyleName> | DynamicMacroStyleRuleConfig<AliasForNested, AliasForSelector, MacroStyleName>)[]
}

interface PresetConfig<
  AliasForNested extends string,
  AliasForSelector extends string,
  MacroStyleName extends string,
> extends CommonConfig<AliasForNested, AliasForSelector, MacroStyleName> {
  /**
   * Name of preset.
   */
  name: string
}

interface StyoEngineConfig<
  AliasForNested extends string,
  AliasForSelector extends string,
  MacroStyleName extends string,
> extends CommonConfig<AliasForNested, AliasForSelector, MacroStyleName> {
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

interface ResolvedConmonConfig<
  AliasForNested extends string,
  AliasForSelector extends string,
  MacroStyleName extends string,
> {
  aliasForNestedConfigList: (StaticAlaisRuleConfig<AliasForNested> | DynamicAlaisRuleConfig<AliasForNested>)[]
  aliasForSelectorConfigList: (StaticAlaisRuleConfig<AliasForSelector> | DynamicAlaisRuleConfig<AliasForSelector>)[]
  macroStyleConfigList: (StaticMacroStyleRuleConfig<AliasForNested, AliasForSelector, MacroStyleName> | DynamicMacroStyleRuleConfig<AliasForNested, AliasForSelector, MacroStyleName>)[]
}

type ResolvedStyoEngineConfig<
  AliasForNested extends string,
  AliasForSelector extends string,
  MacroStyleName extends string,
> = (Required<Omit<StyoEngineConfig<AliasForNested, AliasForSelector, MacroStyleName>, keyof CommonConfig<AliasForNested, AliasForSelector, MacroStyleName>>> & ResolvedConmonConfig<AliasForNested, AliasForSelector, MacroStyleName>) extends infer O
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
  StaticMacroStyleRule,
  DynamicMacroStyleRule,
  MacroStylePartial,
  StyleGroup,
  StyleItem,
  CommonConfig,
  PresetConfig,
  StyoEngineConfig,
  ResolvedConmonConfig,
  ResolvedStyoEngineConfig,
}
