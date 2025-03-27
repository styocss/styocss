import type { Frames } from '../../../src/core-plugin/types'
import type { Engine } from '../../../src/engine'
import type { ResolvedEngineConfig } from '../../../src/engine/config'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { keyframes } from '../../../src/core-plugin/keyframes'
import { resolvePlugins } from '../../../src/engine/plugin'
import { appendAutocompleteCssPropertyValues } from '../../../src/helpers'

// Mock helpers
vi.mock('../../../src/helpers', () => ({
	appendAutocompleteCssPropertyValues: vi.fn(),
}))

describe('core-plugin/keyframes', () => {
	beforeEach(() => {
		vi.resetAllMocks()
	})

	describe('keyframes plugin', () => {
		const createMockConfig = (): ResolvedEngineConfig => ({
			rawConfig: {},
			prefix: '',
			defaultSelector: '.&',
			plugins: [],
			preflights: [],
			autocomplete: {
				selectors: new Set(),
				styleItemStrings: new Set(),
				extraProperties: new Set(),
				extraCssProperties: new Set(),
				properties: new Map(),
				cssProperties: new Map(),
			},
		})

		const createMockEngine = (rules: Array<[string, { content: { property: string, value: string[] } }]>): Engine => ({
			config: createMockConfig(),
			store: {
				atomicRules: new Map(rules),
				atomicNames: new Map(),
			},
			extract: async () => [],
			use: async () => [],
			renderPreviewStyles: async () => '',
			renderStyles: () => '',
			renderPreflights: () => '',
		}) as any as Engine

		it('should create plugin with correct name', () => {
			const pluginDef = keyframes()
			const plugins = resolvePlugins([pluginDef])
			expect(plugins[0]?.name).toBe('core:keyframes')
		})

		describe('beforeConfigResolving hook', () => {
			it('should initialize empty keyframes list when config.keyframes is undefined', () => {
				const pluginDef = keyframes()
				const plugins = resolvePlugins([pluginDef])
				const plugin = plugins[0]
				if (!plugin || !plugin.beforeConfigResolving)
					throw new Error('Plugin initialization failed')

				const config = {}
				plugin.beforeConfigResolving(config)

				const mockConfig = createMockConfig()
				plugin.configResolved?.(mockConfig)
				expect(appendAutocompleteCssPropertyValues).toHaveBeenCalledWith(mockConfig, 'animationName')
				expect(appendAutocompleteCssPropertyValues).toHaveBeenCalledWith(mockConfig, 'animation')
			})
		})

		describe('configResolved hook', () => {
			it('should handle string-only keyframes config', () => {
				const pluginDef = keyframes()
				const plugins = resolvePlugins([pluginDef])
				const plugin = plugins[0]
				if (!plugin || !plugin.beforeConfigResolving || !plugin.configResolved)
					throw new Error('Plugin initialization failed')

				plugin.beforeConfigResolving({ keyframes: ['fade'] })
				const mockConfig = createMockConfig()
				plugin.configResolved(mockConfig)

				expect(appendAutocompleteCssPropertyValues).toHaveBeenCalledWith(mockConfig, 'animationName', 'fade')
				expect(appendAutocompleteCssPropertyValues).toHaveBeenCalledWith(mockConfig, 'animation', 'fade ')
			})

			it('should handle array-style keyframes config', () => {
				const pluginDef = keyframes()
				const plugins = resolvePlugins([pluginDef])
				const plugin = plugins[0]
				if (!plugin || !plugin.beforeConfigResolving || !plugin.configResolved)
					throw new Error('Plugin initialization failed')

				const frames: Frames = {
					from: { opacity: '0' },
					to: { opacity: '1' },
				}
				const autocomplete = ['fade 1s', 'fade 0.5s ease-in']

				plugin.beforeConfigResolving({
					keyframes: [['fade', frames, autocomplete]],
				})

				const mockConfig = createMockConfig()
				plugin.configResolved(mockConfig)

				expect(appendAutocompleteCssPropertyValues).toHaveBeenCalledWith(mockConfig, 'animationName', 'fade')
				expect(appendAutocompleteCssPropertyValues).toHaveBeenCalledWith(mockConfig, 'animation', 'fade ', ...autocomplete)
			})

			it('should handle object-style keyframes config', () => {
				const pluginDef = keyframes()
				const plugins = resolvePlugins([pluginDef])
				const plugin = plugins[0]
				if (!plugin || !plugin.beforeConfigResolving || !plugin.configResolved)
					throw new Error('Plugin initialization failed')

				const frames: Frames = {
					'from': { transform: 'scale(1)' },
					'50%': { transform: 'scale(1.5)' },
					'to': { transform: 'scale(1)' },
				}
				const autocomplete = ['bounce 1s', 'bounce 2s ease-in-out']

				plugin.beforeConfigResolving({
					keyframes: [{
						name: 'bounce',
						frames,
						autocomplete,
					}],
				})

				const mockConfig = createMockConfig()
				plugin.configResolved(mockConfig)

				expect(appendAutocompleteCssPropertyValues).toHaveBeenCalledWith(mockConfig, 'animationName', 'bounce')
				expect(appendAutocompleteCssPropertyValues).toHaveBeenCalledWith(mockConfig, 'animation', 'bounce ', ...autocomplete)
			})

			it('should generate correct CSS for keyframes', () => {
				const pluginDef = keyframes()
				const plugins = resolvePlugins([pluginDef])
				const plugin = plugins[0]
				if (!plugin || !plugin.beforeConfigResolving || !plugin.configResolved)
					throw new Error('Plugin initialization failed')

				const frames: Frames = {
					'from': { opacity: '0', transform: 'translateY(-20px)' },
					'50%': { opacity: '0.5', transform: 'translateY(10px)' },
					'to': { opacity: '1', transform: 'translateY(0)' },
				}

				plugin.beforeConfigResolving({
					keyframes: [{
						name: 'slideIn',
						frames,
					}],
				})

				const mockConfig = createMockConfig()
				plugin.configResolved(mockConfig)

				const mockEngine = createMockEngine([
					['test1', { content: { property: 'animationName', value: ['slideIn'] } }],
					['test2', { content: { property: 'animation', value: ['slideIn 1s ease-out'] } }],
				])

				const generatedCss = mockConfig.preflights[0]?.(mockEngine) ?? ''
				expect(generatedCss).toBe('@keyframes slideIn{from{opacity:0;transform:translateY(-20px)}50%{opacity:0.5;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}')
			})

			it('should handle multiple keyframes and only include used ones', () => {
				const pluginDef = keyframes()
				const plugins = resolvePlugins([pluginDef])
				const plugin = plugins[0]
				if (!plugin || !plugin.beforeConfigResolving || !plugin.configResolved)
					throw new Error('Plugin initialization failed')

				plugin.beforeConfigResolving({
					keyframes: [
						{
							name: 'fade',
							frames: {
								from: { opacity: '0' },
								to: { opacity: '1' },
							},
						},
						{
							name: 'bounce',
							frames: {
								from: { transform: 'translateY(0)' },
								to: { transform: 'translateY(-10px)' },
							},
						},
						{
							name: 'unused',
							frames: {
								from: { scale: '1' },
								to: { scale: '1.1' },
							},
						},
					],
				})

				const mockConfig = createMockConfig()
				plugin.configResolved(mockConfig)

				const mockEngine = createMockEngine([
					['test1', { content: { property: 'animationName', value: ['fade'] } }],
					['test2', { content: { property: 'animation', value: ['bounce 1s'] } }],
				])

				const generatedCss = mockConfig.preflights[0]?.(mockEngine) ?? ''
				expect(generatedCss).toContain('@keyframes fade')
				expect(generatedCss).toContain('@keyframes bounce')
				expect(generatedCss).not.toContain('@keyframes unused')
			})

			it('should handle animation with multiple values', () => {
				const pluginDef = keyframes()
				const plugins = resolvePlugins([pluginDef])
				const plugin = plugins[0]
				if (!plugin || !plugin.beforeConfigResolving || !plugin.configResolved)
					throw new Error('Plugin initialization failed')

				const fadeFrames: Frames = {
					from: { opacity: '0' },
					to: { opacity: '1' },
				}

				const bounceFrames: Frames = {
					'from': { transform: 'translateY(0)' },
					'50%': { transform: 'translateY(-10px)' },
					'to': { transform: 'translateY(0)' },
				}

				plugin.beforeConfigResolving({
					keyframes: [
						['fade', fadeFrames],
						['bounce', bounceFrames],
					],
				})

				const mockConfig = createMockConfig()
				plugin.configResolved(mockConfig)

				const testCases = [
					{
						value: ['fade 1s'],
						expected: ['fade'],
					},
					{
						value: ['fade 1s, bounce 2s'],
						expected: ['fade', 'bounce'],
					},
					{
						value: ['fade 1s', 'bounce 2s'],
						expected: ['fade', 'bounce'],
					},
				]

				testCases.forEach(({ value, expected }) => {
					const mockEngine = createMockEngine([
						['test1', { content: { property: 'animation', value } }],
					])

					const generatedCss = mockConfig.preflights[0]?.(mockEngine) ?? ''
					expected.forEach((name) => {
						expect(generatedCss).toMatch(new RegExp(`@keyframes ${name}\\{[^}]+\\}`))
					})
				})
			})
		})
	})
})
