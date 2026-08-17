import type { EnginePlugin } from '@pikacss/core'
import { describe, expect, it, vi } from 'vitest'

import { reset } from './index'

function createEngine() {
	return {
		addPreflight: vi.fn(),
	}
}

// Mirrors the per-engine context the core dispatcher creates for a plugin
// definition (#116): one context object per simulated engine, each with its
// own `createState()` result.
function createContext(plugin: EnginePlugin) {
	return { onDiagnostic: vi.fn(), state: plugin.createState!() }
}

describe('reset plugin', () => {
	it('configures the reset layer and injects the default reset preflight', async () => {
		const plugin = reset()
		const engine = createEngine()
		const context = createContext(plugin)
		const config = {
			layers: {
				components: 10,
			},
		}

		expect(plugin.name)
			.toBe('reset')
		expect(plugin.order)
			.toBe('pre')

		plugin.configureRawConfig?.(config as any, context)
		await plugin.configureEngine?.(engine as any, context)

		expect(config.layers)
			.toEqual({
				components: 10,
				reset: -1,
			})
		expect(engine.addPreflight)
			.toHaveBeenCalledWith(expect.objectContaining({
				layer: 'reset',
				preflight: expect.stringContaining('html'),
			}))
	})

	it('preserves a user-configured reset layer weight', async () => {
		const plugin = reset()
		const engine = createEngine()
		const context = createContext(plugin)
		const config = {
			layers: {
				reset: 5,
			},
		}

		plugin.configureRawConfig?.(config as any, context)
		await plugin.configureEngine?.(engine as any, context)

		expect(config.layers)
			.toEqual({ reset: 5 })
	})

	it('keeps the configured layer but skips preflight registration for unknown runtime reset values', async () => {
		const plugin = reset()
		const engine = createEngine()
		const context = createContext(plugin)
		const config = {
			reset: 'unknown-reset',
		} as any

		plugin.configureRawConfig?.(config, context)
		await plugin.configureEngine?.(engine as any, context)

		expect(config.layers)
			.toEqual({ reset: -1 })
		expect(engine.addPreflight)
			.not.toHaveBeenCalled()
	})

	describe('per-engine plugin state (#116)', () => {
		it('reuses one plugin instance across two engines without leaking state', async () => {
			const plugin = reset()

			// Engine A: explicit non-default reset style.
			const contextA = createContext(plugin)
			const configA = { reset: 'eric-meyer' } as any
			const engineA = createEngine()
			plugin.configureRawConfig?.(configA, contextA)
			await plugin.configureEngine?.(engineA as any, contextA)

			expect(engineA.addPreflight)
				.toHaveBeenCalledWith(expect.objectContaining({
					layer: 'reset',
					preflight: expect.stringContaining('meyerweb'),
				}))

			// Engine B: reuses the same plugin definition with the option
			// omitted — it must observe the documented default, not A's value.
			const contextB = createContext(plugin)
			const configB = {} as any
			const engineB = createEngine()
			plugin.configureRawConfig?.(configB, contextB)
			await plugin.configureEngine?.(engineB as any, contextB)

			expect(engineB.addPreflight)
				.toHaveBeenCalledWith(expect.objectContaining({
					layer: 'reset',
					preflight: expect.stringContaining('box-sizing'),
				}))
			expect(contextB.state.style)
				.toBe('modern-normalize')
			expect(contextA.state.style)
				.toBe('eric-meyer')
		})

		it('keeps concurrently interleaved engines isolated', async () => {
			const plugin = reset()
			const contextA = createContext(plugin)
			const contextB = createContext(plugin)

			// Interleave deterministically: A configures, then B configures
			// with the option omitted, then B finishes, then A finishes. A's
			// configureEngine must still observe A's own value.
			plugin.configureRawConfig?.({ reset: 'eric-meyer' } as any, contextA)
			plugin.configureRawConfig?.({} as any, contextB)

			const engineB = createEngine()
			await plugin.configureEngine?.(engineB as any, contextB)

			const engineA = createEngine()
			await plugin.configureEngine?.(engineA as any, contextA)

			expect(engineB.addPreflight)
				.toHaveBeenCalledWith(expect.objectContaining({
					preflight: expect.stringContaining('box-sizing'),
				}))
			expect(engineA.addPreflight)
				.toHaveBeenCalledWith(expect.objectContaining({
					preflight: expect.stringContaining('meyerweb'),
				}))
		})
	})
})
