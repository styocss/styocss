import type { ResolvedEngineConfig } from '../../../src'
import { beforeEach, describe, expect, it } from 'vitest'
import { extractUsedVarNames, normalizeVariableName, resolveVariableConfig, variables } from '../../../src/core-plugin/variables'
import { type ResolvedEnginePlugin, resolvePlugins } from '../../../src/engine/plugin'

describe('core-plugin/variables', () => {
	describe('extractUsedVarNames', () => {
		it('should extract a single variable name', () => {
			const input = 'color: var(--primary);'
			const result = extractUsedVarNames(input)
			expect(result).toEqual(['--primary'])
		})

		it('should extract multiple variable names', () => {
			const input = 'background: var(--bg), var(--secondary);'
			const result = extractUsedVarNames(input)
			expect(result).toEqual(['--bg', '--secondary'])
		})

		it('should return an empty array for invalid input', () => {
			const input = 'color: red;'
			const result = extractUsedVarNames(input)
			expect(result).toEqual([])
		})

		it('should handle variables with fallback values', () => {
			const input = 'color: var(--primary, red);'
			const result = extractUsedVarNames(input)
			expect(result).toEqual(['--primary'])
		})

		it('should return an empty array for empty input', () => {
			const input = ''
			const result = extractUsedVarNames(input)
			expect(result).toEqual([])
		})

		it('should handle nested var() calls', () => {
			const input = 'color: var(--primary, var(--secondary));'
			const result = extractUsedVarNames(input)
			expect(result).toEqual(['--primary', '--secondary'])
		})
	})

	describe('normalizeVariableName', () => {
		it('should return the name if it already starts with --', () => {
			const name = '--primary'
			const result = normalizeVariableName(name)
			expect(result).toBe('--primary')
		})

		it('should add -- prefix if not present', () => {
			const name = 'primary'
			const result = normalizeVariableName(name)
			expect(result).toBe('--primary')
		})

		it('should add prefix if provided', () => {
			const name = 'primary'
			const prefix = 'theme'
			const result = normalizeVariableName(name, prefix)
			expect(result).toBe('--theme-primary')
		})

		it('should handle empty prefix', () => {
			const name = 'primary'
			const result = normalizeVariableName(name, '')
			expect(result).toBe('--primary')
		})

		it('should handle names with special characters', () => {
			const name = 'primary@color'
			const result = normalizeVariableName(name)
			expect(result).toBe('--primary@color')
		})

		it('should handle empty name and prefix', () => {
			const name = ''
			const prefix = ''
			const result = normalizeVariableName(name, prefix)
			expect(result).toBe('--')
		})
	})

	describe('variables plugin', () => {
		let plugin: ResolvedEnginePlugin<Record<string, any>>

		beforeEach(() => {
			const pluginDef = variables()
			const plugins = resolvePlugins([pluginDef])
			plugin = plugins[0]!
		})

		it('should define a plugin with the correct name', () => {
			expect(plugin.name).toBe('core:variables')
		})

		it('should process variables in beforeConfigResolving', () => {
			const config = {
				variablesPrefix: 'theme',
				variables: ['primary', ['secondary', 'blue']],
			}

			plugin.beforeConfigResolving!(config as any)

			expect(config.variablesPrefix).toBe('theme')
			expect(config.variables).toEqual(['primary', ['secondary', 'blue']])
		})

		it('should generate correct CSS in preflights', () => {
			const config = {
				variables: [
					['primary', 'red'],
					['secondary', 'blue'],
				],
			}

			plugin.beforeConfigResolving!(config as any)

			const resolvedConfig = {
				preflights: [],
				autocomplete: {
					cssProperties: new Map(),
					extraCssProperties: new Set(),
					extraProperties: new Set(),
				},
			} as any as ResolvedEngineConfig

			plugin.configResolved!(resolvedConfig)

			const engine = {
				store: {
					atomicRules: new Map([
						['rule1', { content: { value: ['var(--primary)'] } }],
					]),
				},
			}

			const preflightCSS = resolvedConfig.preflights[0]!(engine as any)
			expect(preflightCSS).toBe(':root{--primary:red}')
		})

		it('should not include unused variables in preflights', () => {
			const config = {
				variables: [
					['primary', 'red'],
					['unused', 'green'],
				],
			}

			plugin.beforeConfigResolving!(config as any)

			const resolvedConfig = {
				preflights: [],
				autocomplete: {
					cssProperties: new Map(),
					extraCssProperties: new Set(),
					extraProperties: new Set(),
				},
			} as any as ResolvedEngineConfig

			plugin.configResolved!(resolvedConfig)

			const engine = {
				store: {
					atomicRules: new Map([
						['rule1', { content: { value: ['var(--primary)'] } }],
					]),
				},
			}

			const preflightCSS = resolvedConfig.preflights[0]!(engine as any)
			expect(preflightCSS).toBe(':root{--primary:red}')
		})

		it('should handle undefined variablesPrefix', () => {
			const config = {
				variables: [['primary', 'red']],
			}

			plugin.beforeConfigResolving!(config as any)

			const resolvedConfig = {
				preflights: [],
				autocomplete: {
					cssProperties: new Map(),
					extraCssProperties: new Set(),
					extraProperties: new Set(),
				},
			} as any as ResolvedEngineConfig

			plugin.configResolved!(resolvedConfig)

			const engine = {
				store: {
					atomicRules: new Map([
						['rule1', { content: { value: ['var(--primary)'] } }],
					]),
				},
			}

			const preflightCSS = resolvedConfig.preflights[0]!(engine as any)
			expect(preflightCSS).toBe(':root{--primary:red}')
		})

		it('should handle empty variables array', () => {
			const config = {
				variables: [],
			}

			plugin.beforeConfigResolving!(config as any)

			const resolvedConfig = {
				preflights: [],
				autocomplete: {
					cssProperties: new Map(),
					extraCssProperties: new Set(),
					extraProperties: new Set(),
				},
			} as any as ResolvedEngineConfig

			plugin.configResolved!(resolvedConfig)

			const engine = {
				store: {
					atomicRules: new Map(),
				},
			}

			const preflightCSS = resolvedConfig.preflights[0]!(engine as any)
			expect(preflightCSS).toBe('')
		})

		it('should handle variables with complex autocomplete configurations', () => {
			const config = {
				variables: [
					['primary', 'red', { asValueOf: ['color'], asProperty: true }],
				],
			}

			plugin.beforeConfigResolving!(config as any)

			const resolvedConfig = {
				preflights: [],
				autocomplete: {
					cssProperties: new Map(),
					extraCssProperties: new Set(),
					extraProperties: new Set(),
				},
			} as any as ResolvedEngineConfig

			plugin.configResolved!(resolvedConfig)

			expect(resolvedConfig.autocomplete.cssProperties.get('color')).toEqual([
				'var(--primary)',
			])
			expect(resolvedConfig.autocomplete.extraCssProperties.has('--primary')).toBe(
				true,
			)
		})

		it('should exclude unused variables from preflights', () => {
			const config = {
				variables: [
					['primary', 'red'],
					['unused', 'blue'],
				],
			}

			plugin.beforeConfigResolving!(config as any)

			const resolvedConfig = {
				preflights: [],
				autocomplete: {
					cssProperties: new Map(),
					extraCssProperties: new Set(),
					extraProperties: new Set(),
				},
			} as any as ResolvedEngineConfig

			plugin.configResolved!(resolvedConfig)

			const engine = {
				store: {
					atomicRules: new Map([
						['rule1', { content: { value: ['var(--primary)'] } }],
					]),
				},
			}

			const preflightCSS = resolvedConfig.preflights[0]!(engine as any)
			expect(preflightCSS).toBe(':root{--primary:red}')
		})

		describe('resolveVariableConfig', () => {
			it('should handle string config', () => {
				const config = 'primary'
				const result = resolveVariableConfig(config)
				expect(result).toEqual({
					name: 'primary',
					value: null,
					autocomplete: { asValueOf: ['*'], asProperty: true },
				})
			})

			it('should handle array config with name and value', () => {
				const config = ['primary', 'red']
				const result = resolveVariableConfig(config as any)
				expect(result).toEqual({
					name: 'primary',
					value: 'red',
					autocomplete: { asValueOf: ['*'], asProperty: true },
				})
			})

			it('should handle array config with autocomplete options', () => {
				const config = ['primary', 'red', { asValueOf: 'color', asProperty: false }]
				const result = resolveVariableConfig(config as any)
				expect(result).toEqual({
					name: 'primary',
					value: 'red',
					autocomplete: { asValueOf: ['color'], asProperty: false },
				})
			})

			it('should handle object config with default autocomplete options', () => {
				const config = { name: 'primary', value: 'red' }
				const result = resolveVariableConfig(config)
				expect(result).toEqual({
					name: 'primary',
					value: 'red',
					autocomplete: { asValueOf: ['*'], asProperty: true },
				})
			})

			it('should handle object config with custom autocomplete options', () => {
				const config = {
					name: 'primary',
					value: 'red',
					autocomplete: { asValueOf: 'color', asProperty: false },
				}
				const result = resolveVariableConfig(config)
				expect(result).toEqual({
					name: 'primary',
					value: 'red',
					autocomplete: { asValueOf: ['color'], asProperty: false },
				})
			})

			it('should handle array config with missing autocomplete options', () => {
				const config = ['primary', 'red', {}]
				const result = resolveVariableConfig(config as any)
				expect(result).toEqual({
					name: 'primary',
					value: 'red',
					autocomplete: { asValueOf: ['*'], asProperty: true },
				})
			})

			it('should handle object config with missing autocomplete options', () => {
				const config = { name: 'primary', value: 'red', autocomplete: {} }
				const result = resolveVariableConfig(config)
				expect(result).toEqual({
					name: 'primary',
					value: 'red',
					autocomplete: { asValueOf: ['*'], asProperty: true },
				})
			})
		})
	})
})
