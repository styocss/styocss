export type MacroUtilityName = (string & {})
export type DynamicMacroUtilityRegExp = RegExp
export type MacroUtilityNameOrAtomicUtilitiesDefinition<AtomicUtilitiesDefinition> = MacroUtilityName | AtomicUtilitiesDefinition
export type MacroUtilityPartial<AtomicUtilitiesDefinition> = MacroUtilityNameOrAtomicUtilitiesDefinition<AtomicUtilitiesDefinition>
export interface StaticMacroUtilityDefinition<AtomicUtilitiesDefinition> {
  name: MacroUtilityName
  partials: MacroUtilityPartial<AtomicUtilitiesDefinition>[]
}
export type CreateMacroUtilityPartialFn<AtomicUtilitiesDefinition> = (matched: string[]) => MacroUtilityPartial<AtomicUtilitiesDefinition>[]
export interface DynamicMacroUtilityDefinition<AtomicUtilitiesDefinition> {
  pattern: DynamicMacroUtilityRegExp
  createPartials: CreateMacroUtilityPartialFn<AtomicUtilitiesDefinition>
}
export type MacroUtilityDefinition<AtomicUtilitiesDefinition> = StaticMacroUtilityDefinition<AtomicUtilitiesDefinition> | DynamicMacroUtilityDefinition<AtomicUtilitiesDefinition>

// =============================================================

export type RegisteredAtomicUtilityKey = string
export interface RegisteredAtomicUtility<AtomicUtilityContent> {
  name: string
  content: AtomicUtilityContent
}

export type EngineWarning =
  | [event: 'MacroUtilityUndefined', macroUtility: string]

export type AtomicUtilitiesDefinitionExtractor<
  AtomicUtilitiesDefinition,
  AtomicUtilityContent,
> = (atomicUtilitiesDefinition: AtomicUtilitiesDefinition) => AtomicUtilityContent[]

export type AtomicUtilityNameGetter<
  AtomicUtilityContent,
> = (atomicUtilityContent: AtomicUtilityContent) => string

export interface EngineOptions<
  AtomicUtilitiesDefinition,
  AtomicUtilityContent,
> {
  atomicUtilitiesDefinitionExtractor: AtomicUtilitiesDefinitionExtractor<AtomicUtilitiesDefinition, AtomicUtilityContent>
  atomicUtilityNameGetter: AtomicUtilityNameGetter<AtomicUtilityContent>
}
