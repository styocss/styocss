import type { Plugin as VitePlugin } from 'vite'
import type { StyoPluginContext } from './shared'
import { resolveId, createFunctionCallTransformer } from './shared'
import { CSS_CONTENT_PLACEHOLDER, PLUGIN_NAME_BUILD_FUNCTION_CALL_TRANSFORMER, PLUGIN_NAME_BUILD_VIRTUAL_CSS } from './constants'

export function createBuildPlugins (ctx: StyoPluginContext): VitePlugin[] {
  return [
    {
      name: PLUGIN_NAME_BUILD_FUNCTION_CALL_TRANSFORMER,
      enforce: 'pre',
      apply: 'build',
      transform: createFunctionCallTransformer(ctx),
    },
    {
      name: PLUGIN_NAME_BUILD_VIRTUAL_CSS,
      enforce: 'pre',
      apply: 'build',
      resolveId (id) {
        return resolveId(id)
      },
      load (id) {
        if (resolveId(id))
          return CSS_CONTENT_PLACEHOLDER

        return undefined
      },
      generateBundle (options, bundle) {
        const shouldCheckJS = ['umd', 'amd', 'iife'].includes(options.format)
        const files = Object.keys(bundle)
          .filter((i) => i.endsWith('.css') || (shouldCheckJS && i.endsWith('.js')))

        if (files.length === 0)
          return

        const css = ctx.engine.renderStyles()

        for (const file of files) {
          const chunk = bundle[file]
          if (chunk != null && chunk.type === 'asset' && typeof chunk.source === 'string')
            chunk.source = chunk.source.replace(CSS_CONTENT_PLACEHOLDER, css)
        }
      },
    },

  ]
}
