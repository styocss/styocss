import type * as CSS from 'csstype'
import type * as AMIE from '@styocss/atomic-macro-item-engine'

type CSSProperties = (CSS.Properties & CSS.PropertiesHyphen) extends infer Temp
  ? { [K in keyof Temp]: Temp[K] extends infer V ? V | (V extends undefined ? never : V)[] | undefined : never }
  : never
interface CSSVariables {
  [K: `--${string}`]: (string & {}) | number
}
export interface Properties extends CSSProperties, CSSVariables {}

export interface AtomicStyoRulesDefinition<
  NestedWithTemplate extends string = never,
  SelectorTemplate extends string = never,
  MacroStyoRuleNameOrTemplate extends string = never,
> extends Properties {
  $nestedWith?: MayStringWithHint<NestedWithTemplate>
  $selector?: MayStringWithHint<SelectorTemplate | CSS.Pseudos>
  $important?: boolean
  $apply?: MayStringWithHint<MacroStyoRuleNameOrTemplate>[]
}

export type LooseAtomicStyoRulesDefinition = AtomicStyoRulesDefinition<string, string, string>

export interface AtomicStyoRuleContent {
  nestedWith?: string
  selector?: string
  important?: boolean
  property?: string
  value?: string | string[] | null | undefined
}

export type MacroStyoRuleOrAtomicStyoRulesDefinition<
  NestedWithTemplate extends string = never,
  SelectorTemplate extends string = never,
  MacroStyoRuleNameOrTemplate extends string = never,
> = ((string & {}) | MacroStyoRuleNameOrTemplate) | AtomicStyoRulesDefinition<NestedWithTemplate, SelectorTemplate, MacroStyoRuleNameOrTemplate>

export type MacroStyoRulePartial<
  NestedWithTemplateName extends string = never,
  SelectorTemplateName extends string = never,
  MacroStyoRuleNameOrTemplate extends string = never,
> = MacroStyoRuleOrAtomicStyoRulesDefinition<NestedWithTemplateName, SelectorTemplateName, MacroStyoRuleNameOrTemplate>

export type StaticMacroStyoRuleDefinition = AMIE.StaticMacroItemDefinition<LooseAtomicStyoRulesDefinition>
export type DynamicMacroStyoRuleDefinition = AMIE.DynamicMacroItemDefinition<LooseAtomicStyoRulesDefinition>
export type MacroStyoRuleDefinition = AMIE.MacroItemDefinition<LooseAtomicStyoRulesDefinition>

export type AtomicStyoRuleDefinitionExtractor = AMIE.AtomicItemsDefinitionExtractor<LooseAtomicStyoRulesDefinition, AtomicStyoRuleContent>

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
export type MayStringWithHint<S extends string = never> = [S] extends [never] ? string : ((string & {}) | S)
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
