import type { Plugin as VitePlugin, ViteDevServer } from 'vite'
import { resolveId } from './shared'
import { createFunctionCallTransformer } from './shared/transformer'
import type { StyoPluginContext } from './shared/types'
import { renderStyles } from './shared/renderer'

const WS_HMR_INJECTED_EVENT = 'styocss:virtual-css-hmr-injected'
const WS_UPDATE_EVENT = 'styocss:virtual-css-update'

export function DevPlugin (ctx: StyoPluginContext): VitePlugin[] {
  let hmrInjected = false
  let server: ViteDevServer | null = null
  const entries = new Set<string>()

  let timer: NodeJS.Timeout | undefined
  let lastCss = ''
  function sendUpdate () {
    if (server && hmrInjected) {
      if (timer) {
        clearTimeout(timer)
        timer = undefined
      }
      timer = setTimeout(() => {
        timer = undefined
        const css = renderStyles(ctx)
        if (css === lastCss)
          return

        lastCss = css
        server!.ws.send({
          type: 'custom',
          event: WS_UPDATE_EVENT,
          data: {
            css,
          },
        })
      }, 100)
    }
  }

  return [
    {
      name: 'styocss:dev:function-call-transform',
      enforce: 'pre',
      apply: 'serve',
      transform: createFunctionCallTransformer(ctx),
    },
    {
      name: 'styocss:dev:virtual-css',
      enforce: 'pre',
      apply: 'serve',
      configureServer (_server) {
        server = _server

        server.ws.on(WS_HMR_INJECTED_EVENT, () => {
          hmrInjected = true
          sendUpdate()
        })
        ctx.styo.onAtomicStyoRuleRegistered(() => {
          sendUpdate()
        })
      },
      resolveId (id) {
        if (resolveId(id)) {
          entries.add(id)
          return id
        }
      },
      load (id) {
        if (resolveId(id))
          return ''
      },
    },
    {
      name: 'styocss:dev:virtual-css-hmr-injection',
      apply (config, env) {
        return env.command === 'serve' && !config.build?.ssr
      },
      enforce: 'post',
      transform (code, id) {
        // inject css modules to send callback on css load
        if (resolveId(id) && code.includes('import.meta.hot')) {
          return `${code}
if (import.meta.hot) {
  import.meta.hot.on('${WS_UPDATE_EVENT}', ({ css }) => {
    __vite__updateStyle(__vite__id, css)
  })
  import.meta.hot.send('${WS_HMR_INJECTED_EVENT}')
}`
        }
      },
    },
  ]
}
