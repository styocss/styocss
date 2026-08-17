import { describe, expect, it, vi } from 'vitest'

import { createDeferred } from '../../_shared/vitest'
import { createEngine } from './engine'
import { defineEnginePlugin, execAsyncHook, execSyncHook, hooks, resolvePlugins } from './plugin'
import { log } from './utils'

describe('resolvePlugins', () => {
	it('sorts plugins by pre/default/post order without mutating the input array', () => {
		const plugins = [
			{ name: 'post', order: 'post' as const },
			{ name: 'default' },
			{ name: 'pre', order: 'pre' as const },
		]
		const resolved = resolvePlugins(plugins as any)
		expect(resolved.map(plugin => plugin.name))
			.toEqual(['pre', 'default', 'post'])
		expect(plugins.map(plugin => plugin.name))
			.toEqual(['post', 'default', 'pre'])
	})
})

describe('execAsyncHook', () => {
	it('applies async payloads and preserves the current payload on nullish returns', async () => {
		const result = await execAsyncHook([
			{ name: 'prepend', async transformSelectors(selectors: string[]) { return ['pre', ...selectors] } },
			{ name: 'keep-current', async transformSelectors() { return undefined } },
			{ name: 'append', async transformSelectors(selectors: string[]) { return [...selectors, 'post'] } },
		] as any, 'transformSelectors', ['base'])
		expect(result)
			.toEqual(['pre', 'base', 'post'])
	})

	it('reports and rethrows plugin errors instead of returning a partial payload', async () => {
		const onDiagnostic = vi.fn()
		const error = new Error('boom')
		await expect(execAsyncHook([
			{ name: 'throws', async transformSelectors() { throw error } },
			{ name: 'must-not-run', async transformSelectors(selectors: string[]) { return [...selectors, 'post'] } },
		] as any, 'transformSelectors', ['base'], { onDiagnostic })).rejects.toBe(error)
		expect(onDiagnostic)
			.toHaveBeenCalledWith(expect.objectContaining({
				level: 'error',
				code: 'plugin-hook-error',
				plugin: 'throws',
				hook: 'transformSelectors',
				cause: error,
			}))
	})

	it('preserves non-Error thrown values as diagnostic causes', async () => {
		const onDiagnostic = vi.fn()
		await expect(execAsyncHook([
			{ name: 'throws-string', async transformSelectors() { throw 'string error' } },
		] as any, 'transformSelectors', ['base'], { onDiagnostic })).rejects.toBe('string error')
		expect(onDiagnostic)
			.toHaveBeenCalledWith(expect.objectContaining({ cause: 'string error' }))
	})

	it('uses the logger as a fallback when no diagnostic handler is supplied', async () => {
		const errorSink = vi.fn()
		const error = new Error('fallback failure')
		log.setErrorFn(errorSink)
		try {
			await expect(execAsyncHook([
				{ name: 'fallback-error', async transformSelectors() { throw error } },
			] as any, 'transformSelectors', ['base'])).rejects.toBe(error)
			expect(errorSink)
				.toHaveBeenCalledWith(
					expect.any(String),
					expect.stringContaining('Plugin "fallback-error" failed to execute hook "transformSelectors"'),
					error,
				)
		}
		finally {
			log.setErrorFn(() => {})
		}
	})
})

describe('execSyncHook', () => {
	it('reports and rethrows synchronous plugin errors', () => {
		const onDiagnostic = vi.fn()
		const error = new Error('boom')
		expect(() => execSyncHook([
			{ name: 'throws', rawConfigConfigured() { throw error } },
		] as any, 'rawConfigConfigured', { count: 0 }, { onDiagnostic }))
			.toThrow(error)
		expect(onDiagnostic)
			.toHaveBeenCalledWith(expect.objectContaining({ code: 'plugin-hook-error', cause: error }))
	})
})

describe('hooks facade', () => {
	it('delegates typed async hooks through the shared facade', async () => {
		const result = await hooks.transformStyleItems([
			{ name: 'append-item', async transformStyleItems(styleItems: string[]) { return [...styleItems, 'extra'] } },
		] as any, ['base'])
		expect(result)
			.toEqual(['base', 'extra'])
	})
})

describe('engine-scoped hooks', () => {
	it('routes transform hook failures through the engine diagnostic handler', async () => {
		const onDiagnostic = vi.fn()
		const error = new Error('transform failed')
		const engine = await createEngine({
			plugins: [{
				name: 'transform-error',
				transformStyleItems() { throw error },
			}],
		}, { onDiagnostic })

		await expect(engine.use({ color: 'red' })).rejects.toBe(error)
		expect(onDiagnostic)
			.toHaveBeenCalledWith(expect.objectContaining({
				code: 'plugin-hook-error',
				plugin: 'transform-error',
				hook: 'transformStyleItems',
				cause: error,
			}))
	})

	it('isolates engine execution from a throwing host diagnostic handler', async () => {
		const engine = await createEngine({
			plugins: [{
				name: 'diagnostic-producer',
				configureRawConfig(config, context) {
					context?.onDiagnostic({ level: 'warning', code: 'test-warning', message: 'warning' })
					return config
				},
			}],
		}, {
			onDiagnostic() { throw new Error('host handler failed') },
		})

		expect(engine)
			.toBeDefined()
	})
})

describe('defineEnginePlugin', () => {
	it('returns the same plugin instance at runtime', () => {
		const plugin = { name: 'identity' }
		expect(defineEnginePlugin(plugin as any))
			.toBe(plugin)
	})
})

describe('per-engine plugin state (#116)', () => {
	it('gives each engine its own state object from one reused plugin definition', async () => {
		let created = 0
		const plugin = defineEnginePlugin({
			name: 'test:stateful',
			createState: () => {
				created += 1
				return { color: 'default' }
			},
			configureRawConfig: (config: any, context) => {
				if (config.testColor != null)
					context!.state.color = config.testColor
			},
			configureEngine: (engine: any, context) => {
				engine.__observedColor = context!.state.color
			},
		})

		const withPlugin = async (config: any) => createEngine({ ...config, plugins: [plugin] })
		const a = await withPlugin({ testColor: 'red' })
		const b = await withPlugin({})

		expect((a as any).__observedColor)
			.toBe('red')
		// B reuses the same definition but must observe only its own default.
		expect((b as any).__observedColor)
			.toBe('default')
		expect(created)
			.toBe(2)
	})

	it('isolates state across concurrently created engines using one definition', async () => {
		const holdA = createDeferred()
		const releaseB = createDeferred()
		const observed: Record<string, string> = {}

		const plugin = defineEnginePlugin({
			name: 'test:concurrent-stateful',
			createState: () => ({ value: 'default' }),
			configureRawConfig: (config: any, context) => {
				if (config.testValue != null)
					context!.state.value = config.testValue
			},
			configureEngine: (engine: any, context) => {
				observed[engine.config.prefix] = context!.state.value
			},
		})
		// Registered after the stateful plugin: suspends engine A between the
		// stateful plugin's configureRawConfig and its configureEngine, while
		// engine B runs to completion with the same definition.
		const gate = defineEnginePlugin({
			name: 'test:gate',
			configureRawConfig: async (config: any) => {
				if (config.testValue === 'from-a') {
					releaseB.resolve()
					await holdA.promise
				}
			},
		})

		const creatingA = createEngine({ prefix: 'a-', testValue: 'from-a', plugins: [plugin, gate] } as any)
		await releaseB.promise
		await createEngine({ prefix: 'b-', plugins: [plugin, gate] } as any)
		holdA.resolve()
		await creatingA

		expect(observed['b-'])
			.toBe('default')
		// A resumed after B finished, and still observes its own state.
		expect(observed['a-'])
			.toBe('from-a')
	})

	it('passes the same context object to every hook of one plugin/engine pair', async () => {
		const contexts: unknown[] = []
		const plugin = defineEnginePlugin({
			name: 'test:same-context',
			createState: () => ({}),
			configureRawConfig: (_config, context) => {
				contexts.push(context)
			},
			configureEngine: (_engine, context) => {
				contexts.push(context)
			},
			transformStyleItems: (styleItems, context) => {
				contexts.push(context)
				return styleItems
			},
			atomicStyleAdded: (_style, context) => {
				contexts.push(context)
			},
		})

		const engine = await createEngine({ plugins: [plugin] })
		await engine.use({ color: 'red' })

		expect(contexts.length)
			.toBeGreaterThanOrEqual(4)
		expect(new Set(contexts).size)
			.toBe(1)
	})

	it('leaves stateless plugins without state machinery', async () => {
		let observedState: unknown = 'unset'
		const plugin = defineEnginePlugin({
			name: 'test:stateless',
			configureEngine: (_engine, context) => {
				observedState = context!.state
			},
		})
		await createEngine({ plugins: [plugin] })

		expect(observedState)
			.toBeUndefined()
	})

	it('keeps built-in core plugin state isolated per engine by construction', async () => {
		const a = await createEngine({ shortcuts: { definitions: [['btn', { color: 'red' }]] } })
		const b = await createEngine()

		expect(await a.use('btn'))
			.toEqual(['pk-a'])
		// B's own shortcuts() instance never saw A's config: the reference
		// stays unresolved instead of expanding.
		expect(await b.use('btn'))
			.toEqual(['btn'])
	})
})
