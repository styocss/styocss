import type {
  EventHookListener,
} from '@styocss/shared'
import {
  createEventHook,
} from '@styocss/shared'
import type {
  DynamicMacroItemDefinition,
  EngineOptions,
  EngineWarning,
  MacroItemDefinition,
  RegisteredAtomicItemKey,
  RegisteredAtomicItem,
  StaticMacroItemDefinition,
  MacroItemNameOrAtomicItemsDefinition,
  MacroItemName,
} from './types'

export * from './types'

export class AtomicMacroItemEngine<
  AtomicItemsDefinition,
  AtomicItemContent,
> {
  #engineOptions: EngineOptions<AtomicItemsDefinition, AtomicItemContent>

  constructor (options: EngineOptions<AtomicItemsDefinition, AtomicItemContent>) {
    this.#engineOptions = options
  }

  // #region static pure functions
  static #isStaticMacroItemDefinition<AtomicItemsDefinition> (definition: MacroItemDefinition<AtomicItemsDefinition>): definition is StaticMacroItemDefinition<AtomicItemsDefinition> {
    return 'name' in definition && 'partials' in definition
  }

  static #isDynamicMacroItemDefinition<AtomicItemsDefinition> (definition: MacroItemDefinition<AtomicItemsDefinition>): definition is DynamicMacroItemDefinition<AtomicItemsDefinition> {
    return 'pattern' in definition && 'createPartials' in definition
  }

  static #classifyMacroItemDefinitions<AtomicItemsDefinition> (definitions: MacroItemDefinition<AtomicItemsDefinition>[]) {
    const result: {
      static: StaticMacroItemDefinition<AtomicItemsDefinition>[]
      dynamic: DynamicMacroItemDefinition<AtomicItemsDefinition>[]
    } = {
      static: [],
      dynamic: [],
    }
    definitions.forEach((definition) => {
      if (AtomicMacroItemEngine.#isStaticMacroItemDefinition(definition))
        result.static.push(definition)

      if (AtomicMacroItemEngine.#isDynamicMacroItemDefinition(definition))
        result.dynamic.push(definition)
    })
    return result
  }
  // #endregion

  // #region event hooks
  #atomicItemRegisteredHook = createEventHook<RegisteredAtomicItem<AtomicItemContent>>()
  #notifyAtomicItemRegistered (registeredAtomicItem: RegisteredAtomicItem<AtomicItemContent>) {
    this.#atomicItemRegisteredHook.trigger(registeredAtomicItem)
  }

  onAtomicItemRegistered (listener: EventHookListener<RegisteredAtomicItem<AtomicItemContent>>) {
    return this.#atomicItemRegisteredHook.on(listener)
  }

  #warnedHook = createEventHook<EngineWarning>()
  #warn (warning: EngineWarning) {
    this.#warnedHook.trigger(warning)
  }

  onWarned (listener: EventHookListener<EngineWarning>) {
    return this.#warnedHook.on(listener)
  }
  // #endregion

  // #region atomic item
  #extractAtomicItemsDefinition (atomicItemsDefinition: AtomicItemsDefinition) {
    return this.#engineOptions.atomicItemsDefinitionExtractor(atomicItemsDefinition)
  }

  #getAtomicItemName (atomicItemContent: AtomicItemContent) {
    return this.#engineOptions.atomicItemNameGetter(atomicItemContent)
  }

  #registeredAtomicItemsMap = new Map<RegisteredAtomicItemKey, RegisteredAtomicItem<AtomicItemContent>>()
  get registeredAtomicItemsMap () {
    return this.#registeredAtomicItemsMap
  }

  #registerAtomicItems (atomicItemContentList: AtomicItemContent[]) {
    atomicItemContentList.forEach((atomicItemContent) => {
      const itemName = this.#getAtomicItemName(atomicItemContent)
      let registeredItem = this.#registeredAtomicItemsMap.get(itemName)

      if (registeredItem != null)
        return

      registeredItem = {
        name: itemName,
        content: atomicItemContent,
      }
      this.#registeredAtomicItemsMap.set(itemName, registeredItem)
      this.#notifyAtomicItemRegistered(registeredItem)
    })
  }

  #useAtomicItemsByDefinition (definition: AtomicItemsDefinition) {
    const atomicItemContentList = this.#extractAtomicItemsDefinition(definition)
    this.#registerAtomicItems(atomicItemContentList)
    const registeredAtomicItemList = atomicItemContentList.map((atomicUtilityContent) => {
      const itemName = this.#getAtomicItemName(atomicUtilityContent)
      const registeredAtomicItem = this.#registeredAtomicItemsMap.get(itemName)!

      return registeredAtomicItem
    })
    return registeredAtomicItemList
  }
  // #endregion

  // #region macro utilities
  #notRegisteredStaticMacroItemDefinitionsMap = new Map<string, StaticMacroItemDefinition<AtomicItemsDefinition>>()
  #dynamicMacroItemDefinitions: DynamicMacroItemDefinition<AtomicItemsDefinition>[] = []
  #registeredMacroItemsMap = new Map<string, RegisteredAtomicItem<AtomicItemContent>[]>()
  #addMacroItems (definitions: MacroItemDefinition<AtomicItemsDefinition>[]) {
    const {
      static: staticMacroItemDefinitions,
      dynamic: dynamicMacroItemDefinitions,
    } = AtomicMacroItemEngine.#classifyMacroItemDefinitions(definitions)

    staticMacroItemDefinitions.forEach((definition) => {
      this.#notRegisteredStaticMacroItemDefinitionsMap.set(definition.name, definition)
    })
    dynamicMacroItemDefinitions.forEach((definition) => {
      this.#dynamicMacroItemDefinitions.push(definition)
    })
  }

  addMacroItems (definitions: MacroItemDefinition<AtomicItemsDefinition>[]) {
    this.#addMacroItems(definitions)
  }

  #registerStaticMacroItem (macroItemName: MacroItemName) {
    const staticMacroItemDefinition = this.#notRegisteredStaticMacroItemDefinitionsMap.get(macroItemName)
    this.#notRegisteredStaticMacroItemDefinitionsMap.delete(macroItemName)
    if (staticMacroItemDefinition == null)
      return

    const { partials } = staticMacroItemDefinition
    const registeredAtomicItemList = partials.flatMap((partial) => this.#useAtomicItems(partial))
    this.#registeredMacroItemsMap.set(macroItemName, registeredAtomicItemList)
  }

  #useStaticMacroItem (macroItemName: MacroItemName) {
    this.#registerStaticMacroItem(macroItemName)
    return this.#registeredMacroItemsMap.get(macroItemName)
  }

  #resolveDynamicMacroItem (macroItemName: MacroItemName) {
    const dynamicMacroItemDefinition = this.#dynamicMacroItemDefinitions.find(({ pattern }) => pattern.test(macroItemName))

    if (dynamicMacroItemDefinition == null)
      return undefined

    const { pattern, createPartials } = dynamicMacroItemDefinition
    const matched = pattern.exec(macroItemName)!
    const resolvedStaticMacroItemDefinition: StaticMacroItemDefinition<AtomicItemsDefinition> = {
      name: macroItemName,
      partials: createPartials(matched),
    }
    return resolvedStaticMacroItemDefinition
  }

  #registerDynamicMacroItem (macroItemName: MacroItemName) {
    const resolvedStaticMacroItem = this.#resolveDynamicMacroItem(macroItemName)

    if (resolvedStaticMacroItem == null)
      return

    this.#addMacroItems([resolvedStaticMacroItem])
    this.#registerStaticMacroItem(macroItemName)
  }

  #useDynamicMacroItem (macroItemName: MacroItemName) {
    this.#registerDynamicMacroItem(macroItemName)
    return this.#useStaticMacroItem(macroItemName)
  }

  #useMacroItem (macroItemName: MacroItemName) {
    const registeredAtomicItemList = this.#registeredMacroItemsMap.get(macroItemName)
      || this.#useStaticMacroItem(macroItemName)
      || this.#useDynamicMacroItem(macroItemName)

    if (registeredAtomicItemList == null)
      this.#warn(['MacroItemUndefined', macroItemName])

    return registeredAtomicItemList ?? []
  }
  // #endregion

  #useAtomicItems (...macroItemNameOrAtomicItemsDefinitionList: MacroItemNameOrAtomicItemsDefinition<AtomicItemsDefinition>[]) {
    const registeredAtomicItemSet = new Set<RegisteredAtomicItem<AtomicItemContent>>()
    macroItemNameOrAtomicItemsDefinitionList.forEach((macroItemNameOrAtomicItemsDefinition) => {
      let registeredAtomicItemList
      if (typeof macroItemNameOrAtomicItemsDefinition === 'string')
        registeredAtomicItemList = this.#useMacroItem(macroItemNameOrAtomicItemsDefinition)
      else
        registeredAtomicItemList = this.#useAtomicItemsByDefinition(macroItemNameOrAtomicItemsDefinition)

      registeredAtomicItemList.forEach((registeredAtomicItem) => registeredAtomicItemSet.add(registeredAtomicItem))
    })

    return Array.from(registeredAtomicItemSet)
  }

  useAtomicItems (...macroItemNameOrAtomicItemsDefinitionList: [MacroItemNameOrAtomicItemsDefinition<AtomicItemsDefinition>, ...MacroItemNameOrAtomicItemsDefinition<AtomicItemsDefinition>[]]) {
    return this.#useAtomicItems(...macroItemNameOrAtomicItemsDefinitionList)
  }
}
