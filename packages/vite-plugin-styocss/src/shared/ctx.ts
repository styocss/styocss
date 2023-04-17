import { createStyoInstance } from '@styocss/core'
import type { StyoPluginContext, StyoPluginOptions } from './types'

const defaultCreateStyoFn: NonNullable<StyoPluginOptions['createStyo']> = (builder) => builder.done()
const defaultTransformTsToJsFn: NonNullable<StyoPluginOptions['transformTsToJs']> = (tsCode) => tsCode

const VIRTUAL_STYO_CSS_ID = 'virtual:styo.css'

export function resolveId (id: string) {
  if (id === VIRTUAL_STYO_CSS_ID)
    return id

  return null
}

export function createCtx (options?: StyoPluginOptions) {
  const {
    extensions = ['.vue', '.ts', '.tsx', '.js', '.jsx'],
    createStyo = defaultCreateStyoFn,
    nameOfStyleFn = 'style',
    autoJoin = false,
    dts = false,
    transformTsToJs = defaultTransformTsToJsFn,
  } = options || {}

  const ctx: StyoPluginContext = {
    styo: createStyo(createStyoInstance()),
    needToTransform (id) {
      return extensions.some((ext) => id.endsWith(ext))
    },
    nameOfStyleFn,
    autoJoin,
    affectedModules: new Set(),
    dts: dts === true ? 'styocss.d.ts' : dts,
    resolvedDtsPath: null,
    transformTsToJs,
  }

  return ctx
}
