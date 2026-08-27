import type { TypegenSnapshot } from './snapshot'
import { describe, expect, it } from 'vitest'

import { renderTypegenDocument } from './render'

function snapshot(contributions: TypegenSnapshot['contributions']): TypegenSnapshot {
	return Object.freeze({ contributions: Object.freeze([...contributions]), previewAssets: Object.freeze([]) })
}

describe('renderTypegenDocument', () => {
	it('renders one unit without legacy str/arr callable variants', () => {
		const content = renderTypegenDocument([{
			fnName: 'pika',
			publicModule: '@pikacss/core',
			transformedFormat: 'string',
			snapshot: snapshot([{
				id: 'shortcuts',
				declarations: 'type __Shortcuts = { btn: string }',
				pika: { sc: '__Shortcuts' },
			}]),
		}])

		expect(content)
			.toContain('type __StyleFn = (...params: __StyleItem[]) => string')
		expect(content)
			.toContain('"sc": __Shortcuts')
		expect(content)
			.toContain('const pika: __PikaTypegenUnit0.Pika')
		expect(content).not.toContain('str:')
		expect(content).not.toContain('arr:')
	})

	it('projects configured callables into Vue ComponentCustomProperties only when the host requests it', () => {
		const content = renderTypegenDocument([
			{
				fnName: 'pika',
				publicModule: '@pikacss/core',
				transformedFormat: 'string',
				vueTemplateGlobals: true,
				snapshot: snapshot([]),
			},
			{
				fnName: 'serverOnly',
				publicModule: '@pikacss/core',
				transformedFormat: 'string',
				snapshot: snapshot([]),
			},
		])

		expect(content)
			.toContain('declare module \'vue\' {')
		expect(content)
			.toContain('interface ComponentCustomProperties {')
		expect(content)
			.toContain('pika: __PikaTypegenUnit0.Pika')
		const vueModule = content.slice(content.indexOf('declare module \'vue\' {'))
		expect(vueModule)
			.not.toContain('serverOnly: __PikaTypegenUnit1.Pika')
	})

	it('isolates supporting declarations across ordered multi-unit rendering', () => {
		const shared = 'type __SameName = { value: string }'
		const content = renderTypegenDocument([
			{
				fnName: 'pika',
				publicModule: '@pikacss/core',
				transformedFormat: 'string',
				snapshot: snapshot([{ id: 'a', declarations: shared, properties: '__SameName' }]),
			},
			{
				fnName: 'adminPika',
				publicModule: '@pikacss/core',
				transformedFormat: 'array',
				snapshot: snapshot([{ id: 'b', declarations: shared, properties: '__SameName' }]),
			},
		])

		expect(content)
			.toContain('declare namespace __PikaTypegenUnit0')
		expect(content)
			.toContain('declare namespace __PikaTypegenUnit1')
		expect(content.match(/type __SameName/g))
			.toHaveLength(2)
		expect(content)
			.toContain('type __StyleFn = (...params: __StyleItem[]) => string[]')
		expect(content)
			.toContain('const adminPika: __PikaTypegenUnit1.Pika')
	})

	it('composes cssPropertyValues as a union consumed by canonical generated CSS inputs', () => {
		const content = renderTypegenDocument([{
			fnName: 'pika',
			publicModule: '@pikacss/core',
			transformedFormat: 'string',
			snapshot: snapshot([
				{ id: 'a', declarations: 'type __A = { color: "a" }', cssPropertyValues: '__A' },
				{ id: 'b', declarations: 'type __B = { color: "b"; display: "grid" }', cssPropertyValues: '__B' },
			]),
		}])

		expect(content)
			.toContain('type __CssPropertyValueContributions = __A | __B')
		expect(content)
			.toContain('type __Properties = import(\"@pikacss/core\").TypegenCSSPropertiesInput<__CssPropertyValueContributions>')
	})

	it('keeps recursive style definitions and the arbitrary selector fallback structural', () => {
		const content = renderTypegenDocument([{
			fnName: 'pika',
			publicModule: '@pikacss/core',
			transformedFormat: 'string',
			snapshot: snapshot([]),
		}])

		expect(content)
			.toContain('interface __StyleDefinitionMapBase {')
		expect(content)
			.toContain('[selector: string]:')
		expect(content)
			.toContain('| __StyleDefinition')
		expect(content)
			.toContain('| __StyleItem[]')
	})

	it('rejects duplicate global callable bindings', () => {
		const unit = {
			fnName: 'pika',
			publicModule: '@pikacss/core',
			transformedFormat: 'string' as const,
			snapshot: snapshot([]),
		}
		expect(() => renderTypegenDocument([unit, unit]))
			.toThrow('fnName "pika" is duplicated')
	})

	it('renders Pika roots by root name rather than contribution or object insertion order', () => {
		const content = renderTypegenDocument([{
			fnName: 'pika',
			publicModule: '@pikacss/core',
			transformedFormat: 'string',
			snapshot: snapshot([
				{ id: 'z', pika: { zed: 'Z', alpha: 'A' } },
				{ id: 'a', pika: { middle: 'M' } },
			]),
		}])
		const alpha = content.indexOf('"alpha": A')
		const middle = content.indexOf('"middle": M')
		const zed = content.indexOf('"zed": Z')

		expect(alpha)
			.toBeLessThan(middle)
		expect(middle)
			.toBeLessThan(zed)
	})

	it('renders byte-identically for snapshots containing the same contributions in different orders', () => {
		const bindings = {
			fnName: 'pika',
			publicModule: '@pikacss/core',
			transformedFormat: 'string' as const,
		}
		const a = { id: 'alpha', declarations: 'type A = string', properties: 'A', pika: { z: 'Z', a: 'A' } }
		const z = { id: 'zeta', declarations: 'type Z = string', properties: 'Z' }

		expect(renderTypegenDocument([{ ...bindings, snapshot: snapshot([a, z]) }]))
			.toBe(renderTypegenDocument([{ ...bindings, snapshot: snapshot([z, a]) }]))
	})
	it('composes selector contributor refs as a direct intersection so recursive generated members remain legal', () => {
		const content = renderTypegenDocument([{
			fnName: 'pika',
			publicModule: '@pikacss/core',
			transformedFormat: 'string',
			snapshot: snapshot([
				{ id: 'a', declarations: 'interface A { dark?: __StyleDefinition }', selectors: 'A' },
				{ id: 'b', declarations: 'interface B { hover?: __StyleDefinition }', selectors: 'B' },
			]),
		}])

		expect(content)
			.toContain('type __SelectorContributions = A & B')
		expect(content)
			.toContain('type __StyleDefinitionMap = __StyleDefinitionMapBase & __SelectorContributions')
	})

	it('routes cssPropertyValues wildcard through the canonical CSS input helper', () => {
		const content = renderTypegenDocument([{
			fnName: 'pika',
			publicModule: '@pikacss/core',
			transformedFormat: 'string',
			snapshot: snapshot([{
				id: 'values',
				declarations: 'interface Values { "*": "var(--all)"; color: "var(--color)" }',
				cssPropertyValues: 'Values',
			}]),
		}])

		expect(content)
			.toContain('TypegenCSSPropertiesInput<__CssPropertyValueContributions>')
	})
	it('applies propertyConstraints restrictively across both property and selector-map branches', () => {
		const content = renderTypegenDocument([{
			fnName: 'pika',
			publicModule: '@pikacss/core',
			transformedFormat: 'string',
			snapshot: snapshot([
				{ id: 'a', declarations: 'interface __A { color?: "a" }', propertyConstraints: '__A' },
				{ id: 'b', declarations: 'interface __B { display?: "grid" }', propertyConstraints: '__B' },
			]),
		}])

		expect(content)
			.toContain('type __PropertyConstraints = __A & __B')
		expect(content)
			.toContain('type __ConstrainedProperties = Omit<__Properties, keyof __PropertyConstraints> & __PropertyConstraints')
		expect(content)
			.toContain('type __StyleDefinitionMap = __StyleDefinitionMapBase & __SelectorContributions & __PropertyConstraints')
		expect(content)
			.toContain('type __StyleDefinition = __ConstrainedProperties | __StyleDefinitionMap')
		expect(content).not.toContain('      | __Properties\n      | __StyleDefinition')
		expect(content).not.toContain('& __Additive<__PropertyConstraints>')
	})
})
