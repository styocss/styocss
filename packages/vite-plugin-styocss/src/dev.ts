import type { ViteDevServer, Plugin as VitePlugin } from 'vite'
import type { StyoPluginContext } from './shared'
import { createFunctionCallTransformer, resolveId } from './shared'
import { PLUGIN_NAME_DEV_FUNCTION_CALL_TRANSFORMER, PLUGIN_NAME_DEV_VIRTUAL_CSS, PLUGIN_NAME_DEV_VIRTUAL_CSS_HMR, WS_HMR_INJECTED_EVENT, WS_UPDATE_EVENT } from './constants'

export function createDevPlugins(ctx: StyoPluginContext): VitePlugin[] {
	let hmrInjected = false
	let server: ViteDevServer | null = null

	let timer: NodeJS.Timeout | undefined
	let lastCss = ''
	function sendUpdate(force = false) {
		if (server && hmrInjected) {
			if (timer) {
				clearTimeout(timer)
				timer = undefined
			}
			timer = setTimeout(() => {
				timer = undefined
				const css = ctx.engine.renderStyles()
				if (!force && (css === lastCss))
					return

				lastCss = css
				server!.ws.send({
					type: 'custom',
					event: WS_UPDATE_EVENT,
					data: {
						css,
					},
				})
			}, 0)
		}
	}

	return [
		{
			name: PLUGIN_NAME_DEV_FUNCTION_CALL_TRANSFORMER,
			enforce: 'pre',
			apply: 'serve',
			transform: createFunctionCallTransformer(ctx),
		},
		{
			name: PLUGIN_NAME_DEV_VIRTUAL_CSS,
			enforce: 'pre',
			apply: 'serve',
			configureServer(_server) {
				server = _server

				server.ws.on(WS_HMR_INJECTED_EVENT, () => {
					hmrInjected = true
					sendUpdate(true)
				})
				ctx.engine.onAtomicStyleAdded(() => {
					sendUpdate()
				})
			},
			resolveId(id) {
				if (resolveId(id))
					return id

				return undefined
			},
			load(id) {
				if (resolveId(id))
				// Force to hide everything before replacing it with the real css
					return 'body{display:none !important}'

				return undefined
			},
		},
		{
			name: PLUGIN_NAME_DEV_VIRTUAL_CSS_HMR,
			apply(config, env) {
				return env.command === 'serve' && !config.build?.ssr
			},
			enforce: 'post',
			transform(code, id) {
				// inject css modules to send callback on css load
				if (resolveId(id) && code.includes('import.meta.hot')) {
					return [
						code,
						'if (import.meta.hot) {',
            `  import.meta.hot.on('${WS_UPDATE_EVENT}', ({ css }) => {`,
            '    __vite__updateStyle(__vite__id, css)',
            '  })',
            `  import.meta.hot.send('${WS_HMR_INJECTED_EVENT}')`,
            '}',
					].join('\n')
				}

				return undefined
			},
		},
	]
}
