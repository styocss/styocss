import type { StyoInstance, StyoInstanceBuilder } from '@styocss/core'

export interface StyoPluginContext {
  styo: StyoInstance
  needToTransform: (id: string) => boolean
  transformTsToJs: (jsCode: string) => Promise<string> | string
  nameOfStyleFn: string
  dts: false | string
  resolvedDtsPath: string | null
  affectedModules: Set<string>
}

export interface StyoPluginOptions {
  /**
   * List of file extensions to be processed by the plugin.
   * @default ['.vue', '.ts', '.tsx', '.js', '.jsx']
   */
  extensions?: string[]

  /**
   * Function to create a Styo instance. If not provided, a default instance will be created.
   * The function would provide a builder instance to customize the Styo instance.
   */
  createStyo?: (builder: StyoInstanceBuilder) => StyoInstance

  /**
   * Customize the name of the style function.
   * @default 'style'
   */
  nameOfStyleFn?: string

  /**
   * Enable/disable the generation of d.ts files.
   * If a string is provided, it will be used as the path to the d.ts file.
   * Default path is `<path to vite config>/styocss.d.ts`.
   * @default false
   */
  dts?: boolean | string

  /**
   * Function to transform the ts code to js code.
   * Just ignore this option if you don't know what it is.
   */
  transformTsToJs?: (tsCode: string) => Promise<string> | string
}
