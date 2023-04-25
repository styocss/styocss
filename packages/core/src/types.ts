import type * as CSS from 'csstype'

type CSSProperties = (CSS.Properties & CSS.PropertiesHyphen) extends infer Temp
  ? { [K in keyof Temp]: Temp[K] extends infer V ? V | (V extends undefined ? never : V)[] | undefined : never }
  : never
interface CSSVariables {
  [K: `--${string}`]: (string & {}) | number
}
export interface Properties extends CSSProperties, CSSVariables {}

export interface AtomicStyleContent {
  nested: string
  selector: string
  important: boolean
  property: string
  value: string | string[] | null | undefined
}

export interface AddedAtomicStyle {
  name: string
  content: AtomicStyleContent
}

export interface StaticAliasRule<Alias extends string> {
  key: string
  alias: Alias
  value: string
}

export interface DynamicAliasRule<Alias extends string> {
  key: string
  pattern: RegExp
  exampleList: Alias[]
  createValue: (matched: RegExpMatchArray) => string
}

export interface StaticMacroStyleRule<
  AliasForNested extends string,
  AliasForSelector extends string,
  MacroStyleName extends string,
> {
  key: string
  name: MacroStyleName
  partials: MacroStylePartial<AliasForNested, AliasForSelector, MacroStyleName>[]
}

export interface DynamicMacroStyleRule<
  AliasForNested extends string,
  AliasForSelector extends string,
  MacroStyleName extends string,
> {
  key: string
  pattern: RegExp
  exampleList: MacroStyleName[]
  createPartials: (matched: RegExpMatchArray) => MacroStylePartial<AliasForNested, AliasForSelector, MacroStyleName>[]
}

export type MacroStylePartial<
  AliasForNested extends string,
  AliasForSelector extends string,
  MacroStyleName extends string,
> = StyleItem<AliasForNested, AliasForSelector, MacroStyleName>
export interface StyleGroup<
  AliasForNested extends string,
  AliasForSelector extends string,
  MacroStyleName extends string,
> extends Properties {
  $nested?: (string & {}) | (string extends AliasForNested ? never : AliasForNested)
  $selector?: (string & {} | CSS.Pseudos) | (string extends AliasForSelector ? never : AliasForSelector)
  $important?: boolean
  $apply?: ((string & {}) | (string extends MacroStyleName ? never : MacroStyleName))[]
}

export type StyleItem<
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
export interface CommonConfig<
  AliasForNested extends string,
  AliasForSelector extends string,
  MacroStyleName extends string,
> {
  presets?: PresetConfig<AliasForNested, AliasForSelector, MacroStyleName>[]
  aliases?: {
    nested?: (StaticAlaisRuleConfig<AliasForNested> | DynamicAlaisRuleConfig<AliasForNested>)[]
    selector?: (StaticAlaisRuleConfig<AliasForSelector> | DynamicAlaisRuleConfig<AliasForSelector>)[]
  }
  macroStyles?: (StaticMacroStyleRuleConfig<AliasForNested, AliasForSelector, MacroStyleName> | DynamicMacroStyleRuleConfig<AliasForNested, AliasForSelector, MacroStyleName>)[]
}

export interface PresetConfig<
  AliasForNested extends string,
  AliasForSelector extends string,
  MacroStyleName extends string,
> extends CommonConfig<AliasForNested, AliasForSelector, MacroStyleName> {
  name: string
}

export interface StyoEngineConfig<
  AliasForNested extends string,
  AliasForSelector extends string,
  MacroStyleName extends string,
> extends CommonConfig<AliasForNested, AliasForSelector, MacroStyleName> {
  prefix?: string
  defaultNested?: string
  defaultSelector?: string
  defaultImportant?: boolean
}

export interface ResolvedConmonConfig<
  AliasForNested extends string,
  AliasForSelector extends string,
  MacroStyleName extends string,
> {
  aliasForNestedConfigList: (StaticAlaisRuleConfig<AliasForNested> | DynamicAlaisRuleConfig<AliasForNested>)[]
  aliasForSelectorConfigList: (StaticAlaisRuleConfig<AliasForSelector> | DynamicAlaisRuleConfig<AliasForSelector>)[]
  macroStyleConfigList: (StaticMacroStyleRuleConfig<AliasForNested, AliasForSelector, MacroStyleName> | DynamicMacroStyleRuleConfig<AliasForNested, AliasForSelector, MacroStyleName>)[]
}

export type ResolvedStyoEngineConfig<
  AliasForNested extends string,
  AliasForSelector extends string,
  MacroStyleName extends string,
> = (Required<Omit<StyoEngineConfig<AliasForNested, AliasForSelector, MacroStyleName>, keyof CommonConfig<AliasForNested, AliasForSelector, MacroStyleName>>> & ResolvedConmonConfig<AliasForNested, AliasForSelector, MacroStyleName>) extends infer O
  ? {
      [K in keyof O]: O[K]
    }
  : never
