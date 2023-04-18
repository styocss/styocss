import type * as CSS from 'csstype'
import type * as AMIE from '@styocss/atomic-macro-item-engine'

interface CSSVariables {
  [K: `--${string}`]: (string & {}) | number
}
export interface Properties extends CSS.Properties, CSS.PropertiesHyphen, CSSVariables {}

export interface AtomicStyoRulesDefinition<
  NestedWithTemplate extends string = string,
  SelectorTemplate extends string = string,
  > extends Properties {
  $nestedWith?: (string & {}) | NestedWithTemplate
  $selector?: (string & {}) | SelectorTemplate
  $important?: boolean
}

export interface AtomicStyoRuleContent {
  nestedWith?: string
  selector?: string
  important?: boolean
  property?: string
  value?: unknown
}

export type MacroStyoRuleNameOrAtomicStyoRulesDefinition<
  NestedWithTemplate extends string = string,
  SelectorTemplate extends string = string,
  MacroStyoRuleNameOrTemplate extends string = string,
> = Omit<(string & {}), keyof InstanceType<typeof String>> | MacroStyoRuleNameOrTemplate | AtomicStyoRulesDefinition<NestedWithTemplate, SelectorTemplate>

export type MacroStyoRulePartial<
  NestedWithTemplateName extends string = string,
  SelectorTemplateName extends string = string,
  MacroStyoRuleNameOrTemplate extends string = string,
> = MacroStyoRuleNameOrAtomicStyoRulesDefinition<NestedWithTemplateName, SelectorTemplateName, MacroStyoRuleNameOrTemplate>

export type StaticMacroStyoRuleDefinition = AMIE.StaticMacroItemDefinition<AtomicStyoRulesDefinition>
export type DynamicMacroStyoRuleDefinition = AMIE.DynamicMacroItemDefinition<AtomicStyoRulesDefinition>
export type MacroStyoRuleDefinition = AMIE.MacroItemDefinition<AtomicStyoRulesDefinition>

export type AtomicStyoRuleDefinitionExtractor = AMIE.AtomicItemsDefinitionExtractor<AtomicStyoRulesDefinition, AtomicStyoRuleContent>

export type AtomicStyoRuleNameGetter = AMIE.AtomicItemNameGetter<AtomicStyoRuleContent>

export type RegisteredAtomicStyoRuleObject = AMIE.RegisteredAtomicItemObject<AtomicStyoRuleContent>

export type RegisteredMacroStyoRuleObject = {
  definition: StaticMacroStyoRuleDefinition
} | {
  template: string
  definition: DynamicMacroStyoRuleDefinition
}

export type RegisteredMacroStyoRuleObjectMap = Map<string, RegisteredMacroStyoRuleObject>

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
  nestedWithTemplateMap: Map<string, string>
  selectorTemplateMap: Map<string, string>
  registeredMacroStyoRuleMap: RegisteredMacroStyoRuleObjectMap
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
