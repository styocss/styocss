export type MacroItemName = (string & {})
export type DynamicMacroItemRegExp = RegExp
export type MacroItemNameOrAtomicItemsDefinition<AtomicItemsDefinition> = MacroItemName | AtomicItemsDefinition
export type MacroItemPartial<AtomicItemsDefinition> = MacroItemNameOrAtomicItemsDefinition<AtomicItemsDefinition>
export interface StaticMacroItemDefinition<AtomicItemsDefinition> {
  name: MacroItemName
  partials: MacroItemPartial<AtomicItemsDefinition>[]
}
export type CreateMacroItemPartialFn<AtomicItemsDefinition> = (matched: string[]) => MacroItemPartial<AtomicItemsDefinition>[]
export interface DynamicMacroItemDefinition<AtomicItemsDefinition> {
  pattern: DynamicMacroItemRegExp
  createPartials: CreateMacroItemPartialFn<AtomicItemsDefinition>
}
export type MacroItemDefinition<AtomicItemsDefinition> = StaticMacroItemDefinition<AtomicItemsDefinition> | DynamicMacroItemDefinition<AtomicItemsDefinition>

// =============================================================

export type RegisteredAtomicItemKey = string
export interface RegisteredAtomicItem<AtomicItemContent> {
  name: string
  content: AtomicItemContent
}

export type EngineWarning =
  | [event: 'MacroItemUndefined', macroItem: string]

export type AtomicItemsDefinitionExtractor<
  AtomicItemsDefinition,
  AtomicItemContent,
> = (atomicItemsDefinition: AtomicItemsDefinition) => AtomicItemContent[]

export type AtomicItemNameGetter<
  AtomicItemContent,
> = (atomicItemContent: AtomicItemContent) => string

export interface EngineOptions<
  AtomicItemsDefinition,
  AtomicItemContent,
> {
  atomicItemsDefinitionExtractor: AtomicItemsDefinitionExtractor<AtomicItemsDefinition, AtomicItemContent>
  atomicItemNameGetter: AtomicItemNameGetter<AtomicItemContent>
}
