import { createEngine, renderTypegenDocument } from '@pikacss/core'
import { describe, expect, it } from 'vitest'

import { designTokens } from './index'
import { buildDesignTokenTypegen } from './typegen'

function contribution(engine: Awaited<ReturnType<typeof createEngine>>) {
	return engine.typegen.snapshot.contributions.find(({ id }) => id === 'design-tokens')
}

describe('design Tokens Typegen/Pika ownership', () => {
	it('owns pika.tk with effective prefixed paths and aggregates theme metadata into one leaf', async () => {
		const engine = await createEngine({
			plugins: [designTokens()],
			designTokens: {
				prefix: 'app',
				pruneUnused: false,
				sources: {
					color: {
						primary: {
							$value: '#3b82f6',
							$type: 'color',
							$description: 'Primary brand color */ @deprecated nope',
						},
					},
				},
				themes: {
					dark: {
						selector: '.dark',
						sources: { color: { primary: { $value: '#60a5fa', $type: 'color', $description: 'Dark primary color' } } },
					},
				},
			},
		})

		const tk = engine.pika.getStatic('tk') as { app: { color: { primary: string } } }
		expect(tk.app.color.primary)
			.toBe('var(--app-color-primary)')

		const c = contribution(engine)
		expect(c?.pika)
			.toEqual({ tk: '__PikaDesignTokens' })
		expect(c?.propertyConstraints)
			.toBeUndefined()
		expect(c?.declarations)
			.toContain('"app": {')
		expect(c?.declarations)
			.toContain('"primary": "var(--app-color-primary)"')
		expect(c?.declarations)
			.toContain('Primary brand color')
		expect(c?.declarations)
			.toContain(':root: #3b82f6')
		expect(c?.declarations)
			.toContain('.dark: #60a5fa')
		expect(c?.declarations)
			.toContain('Dark primary color')
		// Shared Core JSDoc renderer must neutralize terminators/user tags.
		expect(c?.declarations).not.toContain('*/ @deprecated nope')
	})

	it('publishes strict propertyConstraints only when strict.types produces governed entries', async () => {
		const engine = await createEngine({
			plugins: [designTokens()],
			designTokens: {
				pruneUnused: false,
				strict: { types: true },
				sources: { color: { primary: { $value: '#3b82f6', $type: 'color' } } },
			},
		})
		const c = contribution(engine)
		expect(c?.propertyConstraints)
			.toBe('__PikaDesignTokenConstraints')
		expect(c?.declarations)
			.toContain('interface __PikaDesignTokenConstraints')
		expect(c?.declarations)
			.toContain('"backgroundColor"?:')
	})

	it('supports unprefixed token paths without introducing an empty namespace segment', async () => {
		const engine = await createEngine({
			plugins: [designTokens()],
			designTokens: {
				pruneUnused: false,
				sources: { space: { sm: { $value: '8px', $type: 'dimension' } } },
			},
		})
		const tk = engine.pika.getStatic('tk') as { space: { sm: string } }
		expect(tk.space.sm)
			.toBe('var(--space-sm)')
		expect(contribution(engine)?.declarations)
			.toContain('"space": {')
	})

	it('renders a complete generic Typegen document for pika.tk + constraints', async () => {
		const engine = await createEngine({
			plugins: [designTokens()],
			designTokens: {
				strict: { types: true },
				sources: { color: { primary: { $value: '#3b82f6', $type: 'color' } } },
			},
		})
		const document = renderTypegenDocument([{
			snapshot: engine.typegen.snapshot,
			fnName: 'pika',
			transformedFormat: 'string',
			publicModule: '@pikacss/core',
		}])
		expect(document)
			.toContain('"tk": __PikaDesignTokens')
		expect(document)
			.toContain('__PikaDesignTokenConstraints')
		expect(document).not.toContain('strictTypes')
	})
})

describe('strict constraint declaration optimization', () => {
	it('keeps small unions inline', () => {
		const declarations = buildDesignTokenTypegen([], '', [
			{ property: 'opacity', union: ['"one"', '"two"'] },
		]).contribution.declarations ?? ''
		expect(declarations)
			.toContain('"opacity"?: import("@pikacss/core").PropertyValue<"one" | "two">')
		expect(declarations).not.toContain('__PikaDesignTokenStrict0')
	})

	it('hoists one large union without creating a shared-tail alias', () => {
		const union = Array.from({ length: 9 }, (_, index) => JSON.stringify(`v${index}`))
		const declarations = buildDesignTokenTypegen([], '', [
			{ property: 'opacity', union },
		]).contribution.declarations ?? ''
		expect(declarations)
			.toContain(`type __PikaDesignTokenStrict0 = ${union.join(' | ')}`)
		expect(declarations)
			.toContain('"opacity"?: import("@pikacss/core").PropertyValue<__PikaDesignTokenStrict0>')
		expect(declarations).not.toContain('__PikaDesignTokenStrictShared')
	})

	it('deduplicates repeated large unions and factors their common tail once', () => {
		const shared = Array.from({ length: 7 }, (_, index) => JSON.stringify(`shared-${index}`))
		const colorUnion = ['"color-a"', '"color-b"', ...shared]
		const dimensionUnion = ['"dimension-a"', '"dimension-b"', ...shared]
		const declarations = buildDesignTokenTypegen([], '', [
			{ property: 'color', union: colorUnion },
			{ property: 'background-color', union: colorUnion },
			{ property: 'width', union: dimensionUnion },
		]).contribution.declarations ?? ''
		expect(declarations)
			.toContain(`type __PikaDesignTokenStrictShared = ${shared.join(' | ')}`)
		expect(declarations)
			.toContain('type __PikaDesignTokenStrict0 = "color-a" | "color-b" | __PikaDesignTokenStrictShared')
		expect(declarations)
			.toContain('type __PikaDesignTokenStrict1 = "dimension-a" | "dimension-b" | __PikaDesignTokenStrictShared')
		expect(declarations.match(/type __PikaDesignTokenStrict0 =/g))
			.toHaveLength(1)
		expect(declarations)
			.toContain('"background-color"?: import("@pikacss/core").PropertyValue<__PikaDesignTokenStrict0>')
		expect(declarations)
			.toContain('"backgroundColor"?: import("@pikacss/core").PropertyValue<__PikaDesignTokenStrict0>')
	})
})
