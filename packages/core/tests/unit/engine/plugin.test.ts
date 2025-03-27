import type { EnginePlugin, ResolvedEnginePlugin } from '../../../src/engine/plugin'
import { describe, expect, it, vi } from 'vitest'
import { defineEnginePlugin, hooks, resolvePlugins } from '../../../src/engine/plugin'

describe('engine/plugin', () => {
	describe('resolvePlugins', () => {
		it('should flatten and sort plugins by order', () => {
			const prePlugin = { name: 'pre-plugin', order: 'pre' as const }
			const normalPlugin1 = { name: 'normal-plugin-1' }
			const normalPlugin2 = { name: 'normal-plugin-2' }
			const postPlugin = { name: 'post-plugin', order: 'post' as const }

			const plugins: EnginePlugin[] = [
				normalPlugin1,
				[prePlugin, postPlugin],
				normalPlugin2,
			]

			const resolved = resolvePlugins(plugins)

			expect(resolved).toHaveLength(4)
			expect(resolved[0]!.name).toBe('pre-plugin')
			expect(resolved[1]!.name).toBe('normal-plugin-1')
			expect(resolved[2]!.name).toBe('normal-plugin-2')
			expect(resolved[3]!.name).toBe('post-plugin')
		})

		it('should handle deeply nested plugin arrays', () => {
			const plugin1 = { name: 'plugin1' }
			const plugin2 = { name: 'plugin2' }
			const plugin3 = { name: 'plugin3' }
			const plugin4 = { name: 'plugin4' }

			const plugins: EnginePlugin[] = [
				plugin1,
				[plugin2, [plugin3, plugin4]],
			]

			const resolved = resolvePlugins(plugins)

			expect(resolved).toHaveLength(4)
			expect(resolved[0]!.name).toBe('plugin1')
			expect(resolved[1]!.name).toBe('plugin2')
			expect(resolved[2]!.name).toBe('plugin3')
			expect(resolved[3]!.name).toBe('plugin4')
		})
	})

	describe('defineEnginePlugin', () => {
		it('should return the plugin as is', () => {
			const plugin = { name: 'test-plugin' }
			expect(defineEnginePlugin(plugin)).toBe(plugin)

			const pluginArray = [{ name: 'plugin1' }, { name: 'plugin2' }]
			expect(defineEnginePlugin(pluginArray)).toBe(pluginArray)
		})
	})

	describe('hooks system', () => {
		describe('sync hooks', () => {
			it('should call sync hooks and pass the payload', () => {
				const mockPlugin1 = {
					name: 'mock-plugin-1',
					beforeConfigResolving: vi.fn(config => ({ ...config, modified1: true })),
				}

				const mockPlugin2 = {
					name: 'mock-plugin-2',
					beforeConfigResolving: vi.fn(config => ({ ...config, modified2: true })),
				}

				const mockPlugin3 = {
					name: 'mock-plugin-3',
					// No hook implementation
				}

				const plugins: ResolvedEnginePlugin[] = [mockPlugin1, mockPlugin2, mockPlugin3]
				const initialConfig = { key: 'value' }

				const result = hooks.beforeConfigResolving(plugins, initialConfig)

				expect(result).toEqual({ key: 'value', modified1: true, modified2: true })
				expect(mockPlugin1.beforeConfigResolving).toHaveBeenCalledWith(initialConfig)
				expect(mockPlugin2.beforeConfigResolving).toHaveBeenCalledWith({ key: 'value', modified1: true })
			})

			it('should handle sync hooks that return undefined', () => {
				const mockPlugin1 = {
					name: 'mock-plugin-1',
					beforeConfigResolving: vi.fn(() => undefined),
				}

				const mockPlugin2 = {
					name: 'mock-plugin-2',
					beforeConfigResolving: vi.fn(config => ({ ...config, modified: true })),
				}

				const plugins: ResolvedEnginePlugin[] = [mockPlugin1, mockPlugin2]
				const initialConfig = { key: 'value' }

				const result = hooks.beforeConfigResolving(plugins, initialConfig)

				expect(result).toEqual({ key: 'value', modified: true })
			})

			it('should handle hooks with void return type', () => {
				const mockPlugin = {
					name: 'mock-plugin',
					atomicRuleAdded: vi.fn(),
				}

				const plugins: ResolvedEnginePlugin[] = [mockPlugin]

				const result = hooks.atomicRuleAdded(plugins)

				expect(result).toBeUndefined()
				expect(mockPlugin.atomicRuleAdded).toHaveBeenCalled()
			})
		})

		describe('async hooks', () => {
			it('should await async hooks and pass the payload', async () => {
				const mockPlugin1 = {
					name: 'mock-plugin-1',
					config: vi.fn().mockResolvedValue({ modified1: true }),
				}

				const mockPlugin2 = {
					name: 'mock-plugin-2',
					config: vi.fn(async config => ({ ...config, modified2: true })),
				}

				const mockPlugin3 = {
					name: 'mock-plugin-3',
					// No hook implementation
				}

				const plugins: ResolvedEnginePlugin[] = [mockPlugin1, mockPlugin2, mockPlugin3]
				const initialConfig = { key: 'value' }

				const result = await hooks.config(plugins, initialConfig)

				expect(result).toEqual({ modified1: true, modified2: true })
				expect(mockPlugin1.config).toHaveBeenCalledWith(initialConfig)
				expect(mockPlugin2.config).toHaveBeenCalledWith({ modified1: true })
			})

			it('should handle async hooks that return undefined', async () => {
				const mockPlugin1 = {
					name: 'mock-plugin-1',
					config: vi.fn().mockResolvedValue(undefined),
				}

				const mockPlugin2 = {
					name: 'mock-plugin-2',
					config: vi.fn().mockResolvedValue({ modified: true }),
				}

				const plugins: ResolvedEnginePlugin[] = [mockPlugin1, mockPlugin2]
				const initialConfig = { key: 'value' }

				const result = await hooks.config(plugins, initialConfig)

				expect(result).toEqual({ modified: true })
			})

			it('should process all defined hooks with array payload', async () => {
				const mockPlugin1 = {
					name: 'mock-plugin-1',
					transformSelectors: vi.fn(selectors => [...selectors, 'selector1']),
				}

				const mockPlugin2 = {
					name: 'mock-plugin-2',
					transformSelectors: vi.fn(selectors => [...selectors, 'selector2']),
				}

				const plugins: ResolvedEnginePlugin[] = [mockPlugin1, mockPlugin2]
				const initialSelectors = ['base']

				const result = await hooks.transformSelectors(plugins, initialSelectors)

				expect(result).toEqual(['base', 'selector1', 'selector2'])
				expect(mockPlugin1.transformSelectors).toHaveBeenCalledWith(initialSelectors)
				expect(mockPlugin2.transformSelectors).toHaveBeenCalledWith(['base', 'selector1'])
			})

			it('should handle all hook types with their payloads', async () => {
				// Test a sample of each hook type to ensure they all work
				const plugins: ResolvedEnginePlugin[] = [
					{
						name: 'test-hooks',
						configResolved: vi.fn(config => ({ ...config, tested: true })),
						transformStyleItems: vi.fn(items => [...items, 'newItem']),
						transformStyleDefinitions: vi.fn(defs => [...defs, { test: 'definition' }]),
					},
				]

				const configResult = await hooks.configResolved(plugins, { original: true } as any)
				expect(configResult).toEqual({ original: true, tested: true })

				const itemsResult = await hooks.transformStyleItems(plugins, ['item1'])
				expect(itemsResult).toEqual(['item1', 'newItem'])

				const defsResult = await hooks.transformStyleDefinitions(plugins, [{ first: 'def' }])
				expect(defsResult).toEqual([{ first: 'def' }, { test: 'definition' }])
			})
		})
	})
})
