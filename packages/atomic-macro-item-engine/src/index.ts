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
  RegisteredAtomicItemObject,
  StaticMacroItemDefinition,
  MacroItemNameOrAtomicItemsDefinition,
  MacroItemName,
} from './types'

export * from './types'

export class AtomicMacroItemEngine<
  AtomicItemsDefinition,
  AtomicItemContent,
> {
  // #region static pure functions
  static _isStaticMacroItemDefinition<AtomicItemsDefinition> (definition: MacroItemDefinition<AtomicItemsDefinition>): definition is StaticMacroItemDefinition<AtomicItemsDefinition> {
    return 'name' in definition && 'partials' in definition
  }

  static _isDynamicMacroItemDefinition<AtomicItemsDefinition> (definition: MacroItemDefinition<AtomicItemsDefinition>): definition is DynamicMacroItemDefinition<AtomicItemsDefinition> {
    return 'pattern' in definition && 'createPartials' in definition
  }

  static _classifyMacroItemDefinitions<AtomicItemsDefinition> (definitions: MacroItemDefinition<AtomicItemsDefinition>[]) {
    const result: {
      static: StaticMacroItemDefinition<AtomicItemsDefinition>[]
      dynamic: DynamicMacroItemDefinition<AtomicItemsDefinition>[]
    } = {
      static: [],
      dynamic: [],
    }
    definitions.forEach((definition) => {
      if (AtomicMacroItemEngine._isStaticMacroItemDefinition(definition))
        result.static.push(definition)

      if (AtomicMacroItemEngine._isDynamicMacroItemDefinition(definition))
        result.dynamic.push(definition)
    })
    return result
  }
  // #endregion

  _engineOptions: EngineOptions<AtomicItemsDefinition, AtomicItemContent>

  constructor (options: EngineOptions<AtomicItemsDefinition, AtomicItemContent>) {
    this._engineOptions = options
  }

  // #region event hooks
  _atomicItemRegisteredHook = createEventHook<RegisteredAtomicItemObject<AtomicItemContent>>()
  _notifyAtomicItemRegistered (registeredAtomicItem: RegisteredAtomicItemObject<AtomicItemContent>) {
    this._atomicItemRegisteredHook.trigger(registeredAtomicItem)
  }

  onAtomicItemRegistered (listener: EventHookListener<RegisteredAtomicItemObject<AtomicItemContent>>) {
    return this._atomicItemRegisteredHook.on(listener)
  }

  _warnedHook = createEventHook<EngineWarning>()
  _warn (warning: EngineWarning) {
    this._warnedHook.trigger(warning)
  }

  onWarned (listener: EventHookListener<EngineWarning>) {
    return this._warnedHook.on(listener)
  }
  // #endregion

  // #region atomic item
  _extractAtomicItemsDefinition (atomicItemsDefinition: AtomicItemsDefinition) {
    return this._engineOptions.atomicItemsDefinitionExtractor(atomicItemsDefinition)
  }

  _getAtomicItemName (atomicItemContent: AtomicItemContent) {
    return this._engineOptions.atomicItemNameGetter(atomicItemContent)
  }

  _registeredAtomicItemMap = new Map<string, RegisteredAtomicItemObject<AtomicItemContent>>()
  get registeredAtomicItemMap () {
    return this._registeredAtomicItemMap
  }

  _registerAtomicItems (atomicItemContentList: AtomicItemContent[]) {
    atomicItemContentList.forEach((atomicItemContent) => {
      const itemName = this._getAtomicItemName(atomicItemContent)
      let registeredItem = this._registeredAtomicItemMap.get(itemName)

      if (registeredItem != null)
        return

      registeredItem = {
        name: itemName,
        content: atomicItemContent,
      }
      this._registeredAtomicItemMap.set(itemName, registeredItem)
      this._notifyAtomicItemRegistered(registeredItem)
    })
  }

  _useAtomicItemsByDefinition (definition: AtomicItemsDefinition) {
    const atomicItemContentList = this._extractAtomicItemsDefinition(definition)
    this._registerAtomicItems(atomicItemContentList)
    const registeredAtomicItemList = atomicItemContentList.map((atomicUtilityContent) => {
      const itemName = this._getAtomicItemName(atomicUtilityContent)
      const registeredAtomicItem = this._registeredAtomicItemMap.get(itemName)!

      return registeredAtomicItem
    })
    return registeredAtomicItemList
  }
  // #endregion

  // #region macro utilities
  _notRegisteredStaticMacroItemDefinitionsMap = new Map<string, StaticMacroItemDefinition<AtomicItemsDefinition>>()
  _dynamicMacroItemDefinitions: DynamicMacroItemDefinition<AtomicItemsDefinition>[] = []
  _registeredMacroItemsMap = new Map<string, RegisteredAtomicItemObject<AtomicItemContent>[]>()
  _addMacroItems (definitions: MacroItemDefinition<AtomicItemsDefinition>[]) {
    const {
      static: staticMacroItemDefinitions,
      dynamic: dynamicMacroItemDefinitions,
    } = AtomicMacroItemEngine._classifyMacroItemDefinitions(definitions)

    staticMacroItemDefinitions.forEach((definition) => {
      this._notRegisteredStaticMacroItemDefinitionsMap.set(definition.name, definition)
    })
    dynamicMacroItemDefinitions.forEach((definition) => {
      this._dynamicMacroItemDefinitions.push(definition)
    })
  }

  addMacroItems (definitions: MacroItemDefinition<AtomicItemsDefinition>[]) {
    this._addMacroItems(definitions)
  }

  _registerStaticMacroItem (macroItemName: MacroItemName) {
    const staticMacroItemDefinition = this._notRegisteredStaticMacroItemDefinitionsMap.get(macroItemName)
    this._notRegisteredStaticMacroItemDefinitionsMap.delete(macroItemName)
    if (staticMacroItemDefinition == null)
      return

    const { partials } = staticMacroItemDefinition
    const registeredAtomicItemList = partials.flatMap((partial) => this._useAtomicItems(partial))
    this._registeredMacroItemsMap.set(macroItemName, registeredAtomicItemList)
  }

  _useStaticMacroItem (macroItemName: MacroItemName) {
    this._registerStaticMacroItem(macroItemName)
    return this._registeredMacroItemsMap.get(macroItemName)
  }

  _resolveDynamicMacroItem (macroItemName: MacroItemName) {
    const dynamicMacroItemDefinition = this._dynamicMacroItemDefinitions.find(({ pattern }) => pattern.test(macroItemName))

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

  _registerDynamicMacroItem (macroItemName: MacroItemName) {
    const resolvedStaticMacroItem = this._resolveDynamicMacroItem(macroItemName)

    if (resolvedStaticMacroItem == null)
      return

    this._addMacroItems([resolvedStaticMacroItem])
    this._registerStaticMacroItem(macroItemName)
  }

  _useDynamicMacroItem (macroItemName: MacroItemName) {
    this._registerDynamicMacroItem(macroItemName)
    return this._useStaticMacroItem(macroItemName)
  }

  _useMacroItem (macroItemName: MacroItemName) {
    const registeredAtomicItemList = this._registeredMacroItemsMap.get(macroItemName)
      || this._useStaticMacroItem(macroItemName)
      || this._useDynamicMacroItem(macroItemName)

    if (registeredAtomicItemList == null)
      this._warn(['MacroItemUndefined', macroItemName])

    return registeredAtomicItemList ?? []
  }
  // #endregion

  _useAtomicItems (...macroItemNameOrAtomicItemsDefinitionList: MacroItemNameOrAtomicItemsDefinition<AtomicItemsDefinition>[]) {
    const registeredAtomicItemSet = new Set<RegisteredAtomicItemObject<AtomicItemContent>>()
    macroItemNameOrAtomicItemsDefinitionList.forEach((macroItemNameOrAtomicItemsDefinition) => {
      let registeredAtomicItemList
      if (typeof macroItemNameOrAtomicItemsDefinition === 'string')
        registeredAtomicItemList = this._useMacroItem(macroItemNameOrAtomicItemsDefinition)
      else
        registeredAtomicItemList = this._useAtomicItemsByDefinition(macroItemNameOrAtomicItemsDefinition)

      registeredAtomicItemList.forEach((registeredAtomicItem) => registeredAtomicItemSet.add(registeredAtomicItem))
    })

    return Array.from(registeredAtomicItemSet)
  }

  useAtomicItems (...macroItemNameOrAtomicItemsDefinitionList: MacroItemNameOrAtomicItemsDefinition<AtomicItemsDefinition>[]) {
    return this._useAtomicItems(...macroItemNameOrAtomicItemsDefinitionList)
  }
}
