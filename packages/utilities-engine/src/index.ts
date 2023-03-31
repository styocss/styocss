import type {
  EventHookListener,
} from '@styocss/shared'
import {
  createEventHook,
} from '@styocss/shared'
import type {
  DynamicMacroUtilityDefinition,
  EngineOptions,
  EngineWarning,
  MacroUtilityDefinition,
  RegisteredAtomicUtilityKey,
  RegisteredAtomicUtility,
  StaticMacroUtilityDefinition,
  MacroUtilityNameOrAtomicUtilitiesDefinition,
  MacroUtilityName,
} from './types'

export * from './types'

export class UtilitiesEngine<
  AtomicUtilitiesDefinition,
  AtomicUtilityContent,
> {
  #engineOptions: EngineOptions<AtomicUtilitiesDefinition, AtomicUtilityContent>

  constructor (options: EngineOptions<AtomicUtilitiesDefinition, AtomicUtilityContent>) {
    this.#engineOptions = options
  }

  // #region static pure functions
  static #isStaticMacroUtilityDefinition<AtomicUtilitiesDefinition> (definition: MacroUtilityDefinition<AtomicUtilitiesDefinition>): definition is StaticMacroUtilityDefinition<AtomicUtilitiesDefinition> {
    return 'name' in definition && 'partials' in definition
  }

  static #isDynamicMacroUtilityDefinition<AtomicUtilitiesDefinition> (definition: MacroUtilityDefinition<AtomicUtilitiesDefinition>): definition is DynamicMacroUtilityDefinition<AtomicUtilitiesDefinition> {
    return 'pattern' in definition && 'createPartials' in definition
  }

  static #classifyMacroUtilityDefinitions<AtomicUtilitiesDefinition> (definitions: MacroUtilityDefinition<AtomicUtilitiesDefinition>[]) {
    const result: {
      static: StaticMacroUtilityDefinition<AtomicUtilitiesDefinition>[]
      dynamic: DynamicMacroUtilityDefinition<AtomicUtilitiesDefinition>[]
    } = {
      static: [],
      dynamic: [],
    }
    definitions.forEach((definition) => {
      if (UtilitiesEngine.#isStaticMacroUtilityDefinition(definition))
        result.static.push(definition)

      if (UtilitiesEngine.#isDynamicMacroUtilityDefinition(definition))
        result.dynamic.push(definition)
    })
    return result
  }
  // #endregion

  // #region event hooks
  #atomicUtilityRegisteredHook = createEventHook<RegisteredAtomicUtility<AtomicUtilityContent>>()
  #notifyAtomicUtilityRegistered (registeredAtomicUtility: RegisteredAtomicUtility<AtomicUtilityContent>) {
    this.#atomicUtilityRegisteredHook.trigger(registeredAtomicUtility)
  }

  onAtomicUtilityRegistered (fn: EventHookListener<RegisteredAtomicUtility<AtomicUtilityContent>>) {
    return this.#atomicUtilityRegisteredHook.on(fn)
  }

  #warnedHook = createEventHook<EngineWarning>()
  #warn (warning: EngineWarning) {
    this.#warnedHook.trigger(warning)
  }

  onWarned (fn: EventHookListener<EngineWarning>) {
    return this.#warnedHook.on(fn)
  }
  // #endregion

  // #region atomic utilities
  #extractAtomicUtilitiesDefinition (atomicUtilitiesDefinition: AtomicUtilitiesDefinition) {
    return this.#engineOptions.atomicUtilitiesDefinitionExtractor(atomicUtilitiesDefinition)
  }

  #getAtomicUtilityName (atomicUtilityContent: AtomicUtilityContent) {
    return this.#engineOptions.atomicUtilityNameGetter(atomicUtilityContent)
  }

  #registeredAtomicUtilitiesMap = new Map<RegisteredAtomicUtilityKey, RegisteredAtomicUtility<AtomicUtilityContent>>()
  get registeredAtomicUtilitiesMap () {
    return this.#registeredAtomicUtilitiesMap
  }

  #registerAtomicUtilities (atomicUtilityContentList: AtomicUtilityContent[]) {
    atomicUtilityContentList.forEach((atomicUtilityContent) => {
      const utilityName = this.#getAtomicUtilityName(atomicUtilityContent)
      let registeredUtility = this.#registeredAtomicUtilitiesMap.get(utilityName)

      if (registeredUtility != null)
        return

      registeredUtility = {
        name: utilityName,
        content: atomicUtilityContent,
      }
      this.#registeredAtomicUtilitiesMap.set(utilityName, registeredUtility)
      this.#notifyAtomicUtilityRegistered(registeredUtility)
    })
  }

  #useAtomicUtilities (definition: AtomicUtilitiesDefinition) {
    const atomicUtilityContentList = this.#extractAtomicUtilitiesDefinition(definition)
    this.#registerAtomicUtilities(atomicUtilityContentList)
    const registeredAtomicUtilityList = atomicUtilityContentList.map((atomicUtilityContent) => {
      const utilityName = this.#getAtomicUtilityName(atomicUtilityContent)
      const registeredAtomicUtility = this.#registeredAtomicUtilitiesMap.get(utilityName)!

      return registeredAtomicUtility
    })
    return registeredAtomicUtilityList
  }
  // #endregion

  // #region macro utilities
  #notRegisteredStaticMacroUtilityDefinitionsMap = new Map<string, StaticMacroUtilityDefinition<AtomicUtilitiesDefinition>>()
  #dynamicMacroUtilityDefinitions: DynamicMacroUtilityDefinition<AtomicUtilitiesDefinition>[] = []
  #registeredMacroUtilitiesMap = new Map<string, RegisteredAtomicUtility<AtomicUtilityContent>[]>()
  #addMacroUtilities (definitions: MacroUtilityDefinition<AtomicUtilitiesDefinition>[]) {
    const {
      static: staticMacroUtilityDefinitions,
      dynamic: dynamicMacroUtilityDefinitions,
    } = UtilitiesEngine.#classifyMacroUtilityDefinitions(definitions)

    staticMacroUtilityDefinitions.forEach((definition) => {
      this.#notRegisteredStaticMacroUtilityDefinitionsMap.set(definition.name, definition)
    })
    dynamicMacroUtilityDefinitions.forEach((definition) => {
      this.#dynamicMacroUtilityDefinitions.push(definition)
    })
  }

  addMacroUtilities (definitions: MacroUtilityDefinition<AtomicUtilitiesDefinition>[]) {
    this.#addMacroUtilities(definitions)
  }

  #registerStaticMacroUtility (macroUtilityName: MacroUtilityName) {
    const staticMacroUtilityDefinition = this.#notRegisteredStaticMacroUtilityDefinitionsMap.get(macroUtilityName)
    this.#notRegisteredStaticMacroUtilityDefinitionsMap.delete(macroUtilityName)
    if (staticMacroUtilityDefinition == null)
      return

    const { partials } = staticMacroUtilityDefinition
    const registeredAtomicUtilityList = partials.flatMap((partial) => this.#useUtilities(partial))
    this.#registeredMacroUtilitiesMap.set(macroUtilityName, registeredAtomicUtilityList)
  }

  #useStaticMacroUtility (macroUtilityName: MacroUtilityName) {
    this.#registerStaticMacroUtility(macroUtilityName)
    return this.#registeredMacroUtilitiesMap.get(macroUtilityName)
  }

  #resolveDynamicDynamicMacroUtility (macroUtilityName: MacroUtilityName) {
    const dynamicMacroUtilityDefinition = this.#dynamicMacroUtilityDefinitions.find(({ pattern }) => pattern.test(macroUtilityName))

    if (dynamicMacroUtilityDefinition == null)
      return undefined

    const { pattern, createPartials } = dynamicMacroUtilityDefinition
    const matched = pattern.exec(macroUtilityName)!
    const staticMacroUtilityDefinition: StaticMacroUtilityDefinition<AtomicUtilitiesDefinition> = {
      name: macroUtilityName,
      partials: createPartials(matched),
    }
    return staticMacroUtilityDefinition
  }

  #registerDynamicMacroUtility (macroUtilityName: MacroUtilityName) {
    const resolvedStaticMacroUtility = this.#resolveDynamicDynamicMacroUtility(macroUtilityName)

    if (resolvedStaticMacroUtility == null)
      return

    this.#addMacroUtilities([resolvedStaticMacroUtility])
    this.#registerStaticMacroUtility(macroUtilityName)
  }

  #useDynamicMacroUtility (macroUtilityName: MacroUtilityName) {
    this.#registerDynamicMacroUtility(macroUtilityName)
    return this.#useStaticMacroUtility(macroUtilityName)
  }

  #useMacroUtility (macroUtilityName: MacroUtilityName) {
    const registeredAtomicUtilityList = this.#registeredMacroUtilitiesMap.get(macroUtilityName)
      || this.#useStaticMacroUtility(macroUtilityName)
      || this.#useDynamicMacroUtility(macroUtilityName)

    if (registeredAtomicUtilityList == null)
      this.#warn(['MacroUtilityUndefined', macroUtilityName])

    return registeredAtomicUtilityList ?? []
  }
  // #endregion

  #useUtilities (...macroUtilityNameOrAtomicUtilitiesDefinitionList: MacroUtilityNameOrAtomicUtilitiesDefinition<AtomicUtilitiesDefinition>[]) {
    const registeredAtomicUtilitySet = new Set<RegisteredAtomicUtility<AtomicUtilityContent>>()
    macroUtilityNameOrAtomicUtilitiesDefinitionList.forEach((item) => {
      let list
      if (typeof item === 'string')
        list = this.#useMacroUtility(item)
      else
        list = this.#useAtomicUtilities(item)

      list.forEach((className) => registeredAtomicUtilitySet.add(className))
    })

    return Array.from(registeredAtomicUtilitySet)
  }

  useUtilities (...macroUtilityNameOrAtomicUtilitiesDefinitionList: [MacroUtilityNameOrAtomicUtilitiesDefinition<AtomicUtilitiesDefinition>, ...MacroUtilityNameOrAtomicUtilitiesDefinition<AtomicUtilitiesDefinition>[]]) {
    return this.#useUtilities(...macroUtilityNameOrAtomicUtilitiesDefinitionList)
  }
}
