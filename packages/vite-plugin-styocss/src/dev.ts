import * as prettier from 'prettier'
import type { ViteDevServer, Plugin as VitePlugin } from 'vite'
import type { StyoPluginContext } from './shared'
import { createFunctionCallTransformer, resolveId } from './shared'
import { DEV_PLUGIN_NAME_PREFIX, HMR_INIT_EVENT, HMR_UPDATE_EVENT } from './constants'

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
	const servers: ViteDevServer[] = []

	let lastCss = ''
	async function _sendUpdate(force = false) {
		for (const server of servers) {
			if (hmrInjected) {
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
	}
	const sendUpdate = throttle(_sendUpdate, 100, true)

	return [
		{
			name: `${DEV_PLUGIN_NAME_PREFIX}:pre`,
			enforce: 'pre',
			apply: 'serve',
			configureServer(server) {
				servers.push(server)

				server.hot.on(HMR_INIT_EVENT, () => {
					hmrInjected = true
					sendUpdate(true)
				})
			},
			buildStart() {
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
			transform: createFunctionCallTransformer(ctx),
		},
		{
			name: `${DEV_PLUGIN_NAME_PREFIX}:post`,
			enforce: 'post',
			apply: 'serve',
			transform(code, id) {
				// inject css modules to send callback on css load
				if (resolveId(id) && code.includes('import.meta.hot')) {
					return [
						code,
						'if (import.meta.hot) {',
						`  import.meta.hot.on('${HMR_UPDATE_EVENT}', ({ css }) => {`,
						'    __vite__updateStyle(__vite__id, css)',
						'  })',
						`  import.meta.hot.send('${HMR_INIT_EVENT}')`,
						'}',
					].join('\n')
				}

				return undefined
			},
		},
	]
}
