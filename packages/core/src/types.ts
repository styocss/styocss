import type * as CSS from 'csstype'

interface CSSVariables {
  [K: `--${string}`]: (string & {}) | number
}
export interface Properties extends CSS.Properties, CSS.PropertiesHyphen, CSSVariables {}

export type AtomicStyoRuleSelector = `${any}{a}${any}`
export interface AtomicStyoRulesDefinition<
  NestedWithTemplate extends string = string,
  SelectorTemplate extends string = string,
  MacroStyoRuleNameOrTemplate extends string = string,
> extends Properties {
  __apply?: MacroStyoRuleNameOrTemplate[]
  __nestedWith?: (string & {}) | NestedWithTemplate
  __selector?: (string & {}) | (SelectorTemplate extends AtomicStyoRuleSelector ? SelectorTemplate : never)
  __important?: boolean
}

export interface AtomicStyoRuleContent {
  nestedWith: string
  selector: string
  important: boolean
  property?: string
  value?: unknown
}

export type MacroStyoRuleNameOrAtomicStyoRulesDefinition<
  NestedWithTemplate extends string = string,
  SelectorTemplate extends string = string,
  MacroStyoRuleNameOrTemplate extends string = string,
> = Omit<(string & {}), keyof InstanceType<typeof String>> | MacroStyoRuleNameOrTemplate | AtomicStyoRulesDefinition<NestedWithTemplate, SelectorTemplate, MacroStyoRuleNameOrTemplate>

export type MacroStyoRulePartial<
  NestedWithTemplateName extends string = string,
  SelectorTemplateName extends string = string,
  MacroStyoRuleNameOrTemplate extends string = string,
> = MacroStyoRuleNameOrAtomicStyoRulesDefinition<NestedWithTemplateName, SelectorTemplateName, MacroStyoRuleNameOrTemplate>

export type StaticMacroStyoRuleDefinition = import('../../atomic-macro-item-engine/src').StaticMacroItemDefinition<AtomicStyoRulesDefinition>
export type DynamicMacroStyoRuleDefinition = import('../../atomic-macro-item-engine/src').DynamicMacroItemDefinition<AtomicStyoRulesDefinition>
export type MacroStyoRuleDefinition = import('../../atomic-macro-item-engine/src').MacroItemDefinition<AtomicStyoRulesDefinition>

export type AtomicStyoRuleDefinitionExtractor = import('../../atomic-macro-item-engine/src').AtomicItemsDefinitionExtractor<AtomicStyoRulesDefinition, AtomicStyoRuleContent>

export type AtomicStyoRuleNameGetter = import('../../atomic-macro-item-engine/src').AtomicItemNameGetter<AtomicStyoRuleContent>

export type RegisteredAtomicStyoRule = import('../../atomic-macro-item-engine/src').RegisteredAtomicItem<AtomicStyoRuleContent>

export type RegisteredMacroStyoRuleMap = Map<
  string,
  {
    definition: StaticMacroStyoRuleDefinition
  } | {
    template: string
    definition: DynamicMacroStyoRuleDefinition
  }
>

export interface CommonStyoData<
  // Just for typescript autocompletion
  /* eslint-disable @typescript-eslint/no-unused-vars, unused-imports/no-unused-vars */
  NestedWithTemplate extends string = never,
  SelectorTemplate extends string = never,
  StaticMacroStyoRuleName extends string = never,
  DynamicMacroStyoRuleNameTemplateMapping = {},
  /* eslint-enable @typescript-eslint/no-unused-vars, unused-imports/no-unused-vars */
> {
  usingPresetNameSet: Set<string>
  nestedWithTemplateSet: Set<string>
  selectorTemplateSet: Set<string>
  registeredMacroStyoRuleMap: RegisteredMacroStyoRuleMap
}

export interface StyoPreset<
  NestedWithTemplate extends string = never,
  SelectorTemplate extends string = never,
  StaticMacroStyoRuleName extends string = never,
  DynamicMacroStyoRuleNameTemplateMapping = {},
> extends CommonStyoData<NestedWithTemplate, SelectorTemplate, StaticMacroStyoRuleName, DynamicMacroStyoRuleNameTemplateMapping> {
  name: string
}

export interface FullStyoOptions extends CommonStyoData {
  prefix: string
  defaultNestedWith: string
  defaultSelector: string
  defaultImportant: boolean
}

/** @internal */
export type MappingToName<M, N extends keyof M = keyof M> = N extends string ? N : never
/** @internal */
export type MappingToTemplate<M, N extends keyof M = keyof M> = M[N] extends infer R ? R extends string ? R : never : never
/** @internal */
export type SetMapping<M, N extends string, T> = Omit<M, N> & { [P in N]: T } extends infer R ? { [P in keyof R]: R[P] } : never
/** @internal */
export type MergeMapping<M1, M2> = Omit<M1, keyof M2> & M2 extends infer R ? { [P in keyof R]: R[P] } : never
/** @internal */
export type TryToRemoveNameFromMapping<M, N extends string> = (N extends keyof M ? Omit<M, N> : M) extends infer R ? { [P in keyof R]: R[P] } : never
