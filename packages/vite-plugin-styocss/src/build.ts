import type { Plugin as VitePlugin } from 'vite'
import { resolveId } from './shared'
import { renderRules } from './shared/renderer'
import { createFunctionCallTransformer } from './shared/transformer'
import type { StyoPluginContext } from './shared/types'

const CSS_CONTENT_PLACEHOLDER = 'styocsstemp{placeholder:0}'

export function BuildPlugin (ctx: StyoPluginContext): VitePlugin[] {
  return [
    {
      name: 'styocss:build:function-call-transform',
      enforce: 'pre',
      apply: 'build',
      transform: createFunctionCallTransformer(ctx),
    },
    {
      name: 'styocss:build:virtual-css',
      enforce: 'pre',
      apply: 'build',
      resolveId (id) {
        return resolveId(id)
      },
      load (id) {
        if (resolveId(id))
          return CSS_CONTENT_PLACEHOLDER
      },
      generateBundle (options, bundle) {
        const shouldCheckJS = ['umd', 'amd', 'iife'].includes(options.format)
        const files = Object.keys(bundle)
          .filter((i) => i.endsWith('.css') || (shouldCheckJS && i.endsWith('.js')))

        if (files.length === 0)
          return

        const css = renderRules(ctx.styo)
          .replace(/\n/g, '')

        for (const file of files) {
          const chunk = bundle[file]
          if (chunk != null && chunk.type === 'asset' && typeof chunk.source === 'string')
            chunk.source = chunk.source.replace(CSS_CONTENT_PLACEHOLDER, css)
        }
      },
    },

  ]
}
