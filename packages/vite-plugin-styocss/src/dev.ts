import * as prettier from 'prettier'
import type { ViteDevServer, Plugin as VitePlugin } from 'vite'
import type { StyoPluginContext } from './shared'
import { createFunctionCallTransformer, resolveId } from './shared'
import { HMR_INJECTED_EVENT, HMR_UPDATE_EVENT, PLUGIN_NAME_DEV_FUNCTION_CALL_TRANSFORMER, PLUGIN_NAME_DEV_VIRTUAL_CSS, PLUGIN_NAME_DEV_VIRTUAL_CSS_HMR, VIRTUAL_STYO_CSS_ID } from './constants'

function throttle<Fn extends (...args: any[]) => void>(fn: Fn, delay: number, trailing = false): Fn {
	let lastCall = 0
	let timer: NodeJS.Timeout | undefined
	let lastArgs: any[] | undefined

	return function (...args: any[]) {
		const now = Date.now()
		lastArgs = args

		if (now - lastCall < delay) {
			if (trailing) {
				if (timer)
					clearTimeout(timer)

				timer = setTimeout(() => {
					lastCall = now
					fn(...lastArgs!)
				}, delay)
			}
		}
		else {
			lastCall = now
			fn(...args)
		}
	} as Fn
}

export function createDevPlugins(ctx: StyoPluginContext): VitePlugin[] {
	let hmrInjected = false
	let server: ViteDevServer | null = null

	let lastCss = ''
	async function _sendUpdate(force = false) {
		if (server && hmrInjected) {
			const css = await prettier.format(ctx.engine.renderStyles(), { parser: 'css' })
			if (!force && (css === lastCss))
				return

			lastCss = css
			server!.hot.send({
				type: 'custom',
				event: HMR_UPDATE_EVENT,
				data: {
					css,
				},
			})
		}
	}
	const sendUpdate = throttle(_sendUpdate, 100, true)

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

				server.hot.on(HMR_INJECTED_EVENT, () => {
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
			apply(_config, env) {
				return env.command === 'serve'
			},
			enforce: 'post',
			transform(code, id) {
				// inject css modules to send callback on css load
				if (resolveId(id) && code.includes('import.meta.hot')) {
					return [
						code,
						'if (import.meta.hot) {',
						`  import.meta.hot.on('${HMR_UPDATE_EVENT}', ({ css }) => {`,
						'    __vite__updateStyle(__vite__id, css)',
						'  })',
						`  import.meta.hot.send('${HMR_INJECTED_EVENT}')`,
						'}',
					].join('\n')
				}

				return undefined
			},
		},
	]
}
