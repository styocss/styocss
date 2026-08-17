import type { EnginePlugin } from '@pikacss/core'
import { describe, expect, it, vi } from 'vitest'

import { typography } from './index'
import { proseHrStyle, proseListsStyle, typographyVariables } from './styles'

function createEngine() {
	return {
		shortcuts: {
			add: vi.fn(),
		},
		variables: {
			add: vi.fn(),
		},
	}
}

// Mirrors the per-engine context the core dispatcher creates for a plugin
// definition (#116): one context object per simulated engine, each with its
// own `createState()` result.
function createContext(plugin: EnginePlugin) {
	return { onDiagnostic: vi.fn(), state: plugin.createState!(), host: {} }
}

describe('typography plugin', () => {
	it('registers default variables and prose shortcuts during engine setup', async () => {
		const plugin = typography()
		const engine = createEngine()
		const context = createContext(plugin)

		await plugin.configureEngine?.(engine as any, context)

		expect(engine.variables.add)
			.toHaveBeenCalledWith(typographyVariables)

		const shortcutNames = engine.shortcuts.add.mock.calls
			.map(call => call[0][0])

		expect(shortcutNames)
			.toEqual(expect.arrayContaining([
				'prose-base',
				'prose',
				'prose-sm',
				'prose-lg',
				'prose-xl',
				'prose-2xl',
				'prose-code',
				'prose-tables',
			]))
	})

	it('scopes list-item edge margins to paragraphs so nested-list margins stay intact', () => {
		for (const list of ['ul', 'ol']) {
			expect(proseListsStyle)
				.toHaveProperty([`$ > ${list} > li > p:first-child`])
			expect(proseListsStyle)
				.toHaveProperty([`$ > ${list} > li > p:last-child`])
			expect(proseListsStyle)
				.not.toHaveProperty([`$ > ${list} > li > :first-child`])
			expect(proseListsStyle)
				.not.toHaveProperty([`$ > ${list} > li > :last-child`])
		}
	})

	it('declares an explicit hr border style so resets with `border: 0` do not hide it', () => {
		expect((proseHrStyle as Record<string, unknown>)['$ hr'])
			.toMatchObject({
				borderTopStyle: 'solid',
				borderTopWidth: '1px',
			})
	})

	it('merges custom variables before registering shortcuts', async () => {
		const plugin = typography()
		const engine = createEngine()
		const context = createContext(plugin)

		plugin.configureRawConfig?.({
			typography: {
				variables: {
					'--pk-prose-color-body': '#123456',
				},
			},
		} as any, context)
		plugin.configureRawConfig?.({} as any, context)

		await plugin.configureEngine?.(engine as any, context)

		expect(engine.variables.add)
			.toHaveBeenCalledWith(expect.objectContaining({
				'--pk-prose-color-body': '#123456',
			}))
		expect(engine.shortcuts.add)
			.toHaveBeenCalled()
	})

	describe('per-engine plugin state (#116)', () => {
		it('reuses one plugin instance across two engines without leaking state', async () => {
			const plugin = typography()

			// Engine A: explicit variable override.
			const contextA = createContext(plugin)
			const engineA = createEngine()
			plugin.configureRawConfig?.({
				typography: {
					variables: {
						'--pk-prose-color-body': '#123456',
					},
				},
			} as any, contextA)
			await plugin.configureEngine?.(engineA as any, contextA)

			expect(engineA.variables.add)
				.toHaveBeenCalledWith(expect.objectContaining({
					'--pk-prose-color-body': '#123456',
				}))

			// Engine B: reuses the same plugin definition with the option
			// omitted — it must observe the documented default, not A's value.
			const contextB = createContext(plugin)
			const engineB = createEngine()
			plugin.configureRawConfig?.({} as any, contextB)
			await plugin.configureEngine?.(engineB as any, contextB)

			expect(engineB.variables.add)
				.toHaveBeenCalledWith(typographyVariables)
			expect(contextB.state.typographyConfig)
				.toEqual({})
			expect(contextA.state.typographyConfig)
				.toEqual({
					variables: {
						'--pk-prose-color-body': '#123456',
					},
				})
		})

		it('keeps concurrently interleaved engines isolated', async () => {
			const plugin = typography()
			const contextA = createContext(plugin)
			const contextB = createContext(plugin)

			// Interleave deterministically: A configures, then B configures
			// with the option omitted, then B finishes, then A finishes. A's
			// configureEngine must still observe A's own value.
			plugin.configureRawConfig?.({
				typography: {
					variables: {
						'--pk-prose-color-body': '#654321',
					},
				},
			} as any, contextA)
			plugin.configureRawConfig?.({} as any, contextB)

			const engineB = createEngine()
			await plugin.configureEngine?.(engineB as any, contextB)

			const engineA = createEngine()
			await plugin.configureEngine?.(engineA as any, contextA)

			expect(engineB.variables.add)
				.toHaveBeenCalledWith(typographyVariables)
			expect(engineA.variables.add)
				.toHaveBeenCalledWith(expect.objectContaining({
					'--pk-prose-color-body': '#654321',
				}))
		})
	})
})
