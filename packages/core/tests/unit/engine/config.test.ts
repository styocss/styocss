import type { EngineConfig } from '../../../src/engine/config'
import { describe, expect, it } from 'vitest'
import { ATOMIC_STYLE_NAME_PLACEHOLDER } from '../../../src/constants'
import { resolveEngineConfig } from '../../../src/engine/config'

describe('test engine/config', () => {
	describe('test resolveEngineConfig', () => {
		it('should return default values when empty config provided', async () => {
			const config: EngineConfig = {}
			const resolved = await resolveEngineConfig(config)
			expect(resolved).toMatchObject({
				prefix: '',
				defaultSelector: `.${ATOMIC_STYLE_NAME_PLACEHOLDER}`,
				plugins: [],
				preflights: [],
				autocomplete: {
					selectors: expect.any(Set),
					styleItemStrings: expect.any(Set),
					extraProperties: expect.any(Set),
					extraCssProperties: expect.any(Set),
					properties: expect.any(Map),
					cssProperties: expect.any(Map),
				},
			})
		})

		it('should properly resolve custom prefix and selector', async () => {
			const config: EngineConfig = {
				prefix: 'test-',
				defaultSelector: '[data-test~="&"]',
			}
			const resolved = await resolveEngineConfig(config)
			expect(resolved.prefix).toBe('test-')
			expect(resolved.defaultSelector).toBe('[data-test~="&"]')
		})

		it('should resolve preflights correctly', async () => {
			const stringPreflight = 'body { margin: 0; }'
			const fnPreflight = () => 'html { box-sizing: border-box; }'
			const config: EngineConfig = {
				preflights: [stringPreflight, fnPreflight],
			}
			const resolved = await resolveEngineConfig(config)
			expect(resolved.preflights).toHaveLength(2)
			expect(resolved.preflights[0]!(null!)).toBe(stringPreflight)
			expect(resolved.preflights[1]!(null!)).toBe('html { box-sizing: border-box; }')
		})

		it('should resolve autocomplete config correctly', async () => {
			const config: EngineConfig = {
				autocomplete: {
					selectors: ['.test', '#id'],
					styleItemStrings: ['flex', 'block'],
					extraProperties: ['custom-prop'],
					extraCssProperties: ['custom-css-prop'],
					properties: [['color', ['red', 'blue']]],
					cssProperties: [['margin', ['10px', 20]]],
				},
			}
			const resolved = await resolveEngineConfig(config)

			expect(resolved.autocomplete.selectors).toEqual(new Set(['.test', '#id']))
			expect(resolved.autocomplete.styleItemStrings).toEqual(new Set(['flex', 'block']))
			expect(resolved.autocomplete.extraProperties).toEqual(new Set(['custom-prop']))
			expect(resolved.autocomplete.extraCssProperties).toEqual(new Set(['custom-css-prop']))
			expect(resolved.autocomplete.properties.get('color')).toEqual(['red', 'blue'])
			expect(resolved.autocomplete.cssProperties.get('margin')).toEqual(['10px', 20])
		})

		it('should preserve raw config', async () => {
			const config: EngineConfig = {
				prefix: 'test-',
				customOption: 'value',
			}
			const resolved = await resolveEngineConfig(config)
			expect(resolved.rawConfig).toBe(config)
		})
	})
})
