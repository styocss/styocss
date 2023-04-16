import type { Plugin as VitePlugin } from 'vite'
import { transformWithEsbuild } from 'vite'
import type { StyoPluginOptions } from './shared/types'
import { DevPlugin } from './dev'
import { BuildPlugin } from './build'
import { createCtx } from './shared'

function StyoPlugin (options: Omit<StyoPluginOptions, 'transformTsToJs'> = {}): VitePlugin[] {
  const ctx = createCtx({
    ...options,
    transformTsToJs: async (tsCode) => (await transformWithEsbuild(tsCode, 'temp.ts')).code,
  })

  return [
    ...DevPlugin(ctx),
    ...BuildPlugin(ctx),
  ]
}

export default StyoPlugin
