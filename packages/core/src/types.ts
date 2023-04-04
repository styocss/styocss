import type * as CSS from 'csstype'

interface CSSVariables {
  [K: `--${string}`]: (string & {}) | number
}
export interface Properties extends CSS.Properties, CSS.PropertiesHyphen, CSSVariables {}

// A valid atomic utility selector should include `{u}`
export type AtomicUtilitySelector = `${any}{u}${any}`
export interface AtomicUtilitiesDefinition<
  NestedWithTemplate extends string = string,
  SelectorTemplate extends string = string,
  MacroUtilityNameOrTemplate extends string = string,
> extends Properties {
  __apply?: MacroUtilityNameOrTemplate[]
  __nestedWith?: (string & {}) | NestedWithTemplate
  __selector?: (AtomicUtilitySelector & {}) | (SelectorTemplate extends AtomicUtilitySelector ? SelectorTemplate : never)
  __important?: boolean
}

export interface AtomicUtilityContent {
  nestedWith: string
  selector: string
  important: boolean
  property?: string
  value?: unknown
}

export type MacroUtilityNameOrAtomicUtilitiesDefinition<
  NestedWithTemplate extends string = string,
  SelectorTemplate extends string = string,
  MacroUtilityNameOrTemplate extends string = string,
> = Omit<(string & {}), keyof InstanceType<typeof String>> | MacroUtilityNameOrTemplate | AtomicUtilitiesDefinition<NestedWithTemplate, SelectorTemplate, MacroUtilityNameOrTemplate>

export type MacroUtilityPartial<
  NestedWithTemplateName extends string = string,
  SelectorTemplateName extends string = string,
  MacroUtilityNameOrTemplate extends string = string,
> = MacroUtilityNameOrAtomicUtilitiesDefinition<NestedWithTemplateName, SelectorTemplateName, MacroUtilityNameOrTemplate>

export type MacroUtilityDefinition = import('@styocss/utilities-engine').MacroUtilityDefinition<AtomicUtilitiesDefinition>

export type AtomicUtilitiesDefinitionExtractor = import('@styocss/utilities-engine').AtomicUtilitiesDefinitionExtractor<AtomicUtilitiesDefinition, AtomicUtilityContent>

export type AtomicUtilityNameGetter = import('@styocss/utilities-engine').AtomicUtilityNameGetter<AtomicUtilityContent>

export type RegisteredAtomicUtility = import('@styocss/utilities-engine').RegisteredAtomicUtility<AtomicUtilityContent>

export interface StyoCommonOptions<
  // Just for typescript autocompletion
  /* eslint-disable @typescript-eslint/no-unused-vars, unused-imports/no-unused-vars */
  NestedWithTemplate extends string = string,
  SelectorTemplate extends string = string,
  MacroUtilityNameOrTemplate extends string = string,
  /* eslint-enable @typescript-eslint/no-unused-vars, unused-imports/no-unused-vars */
> {
  /**
   * @default
   * ```ts
   * []
   * ```
   */
  macroUtilities?: MacroUtilityDefinition[]
}

export interface StyoPreset<
  NestedWithTemplate extends string = string,
  SelectorTemplate extends string = string,
  MacroUtilityNameOrTemplate extends string = string,
> extends StyoCommonOptions<NestedWithTemplate, SelectorTemplate, MacroUtilityNameOrTemplate> {
  name: string
}

export interface StyoOptions<
  NestedWithTemplate extends string = string,
  SelectorTemplate extends string = string,
  MacroUtilityNameOrTemplate extends string = string,
> extends StyoCommonOptions<NestedWithTemplate, SelectorTemplate, MacroUtilityNameOrTemplate> {
  /**
   * @default
   * ```ts
   * ''
   * ```
   */
  atomicUtilityNamePrefix?: string

  /**
   * @default
   * ```ts
   * ''
   * ```
   */
  defaultAtomicUtilityNestedWith?: string

  /**
   * @default
   * ```ts
   * '.{u}'
   * ```
   */
  defaultAtomicUtilitySelector?: string

  /**
   * @default
   * ```ts
   * false
   * ```
   */
  defaultAtomicUtilityImportant?: boolean

  /**
   * @default
   * ```ts
   * []
   * ```
   */
  presets?: StyoPreset[]
}
export type ResolvedStyoOptions = Required<Omit<StyoOptions, 'presets'>>
