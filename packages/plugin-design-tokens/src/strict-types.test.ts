/* eslint-disable no-template-curly-in-string */
import type { Engine } from '@pikacss/core'
import { createEngine } from '@pikacss/core'
import { describe, expect, it } from 'vitest'

import { designTokens } from './index'

const TOKENS = {
	color: {
		primary: { $value: '#3b82f6', $type: 'color' },
		danger: { $value: '#ef4444', $type: 'color' },
	},
	space: { sm: { $value: '8px', $type: 'dimension' } },
	zLayer: { base: { $value: 10, $type: 'number' } },
}

async function makeEngine(designTokensConfig: any): Promise<Engine> {
	return createEngine({
		plugins: [designTokens()],
		designTokens: { pruneUnused: false, ...designTokensConfig },
	})
}

function contribution(engine: Engine) {
	return engine.typegen.snapshot.contributions.find(({ id }) => id === 'design-tokens')
}

function strictAliasForProperty(declarations: string, property: string): string {
	const propertyLine = declarations.split('\n')
		.find(line => line.includes(`${JSON.stringify(property)}?:`)) ?? ''
	const alias = propertyLine.match(/PropertyValue<(__PikaDesignTokenStrict\d+)>/)?.[1]
	if (alias == null)
		return propertyLine
	return declarations.split('\n')
		.find(line => line.startsWith(`type ${alias} = `)) ?? ''
}

describe('strict mode: Typegen propertyConstraints surface', () => {
	it('publishes no constraint when types are disabled and exposes no strictTypes side channel', async () => {
		const engine = await makeEngine({ sources: TOKENS, strict: { level: 'error' } })
		expect(contribution(engine)?.propertyConstraints)
			.toBeUndefined()
		expect('strictTypes' in engine.designTokens!)
			.toBe(false)
	})

	it('publishes no constraint when there are no design tokens', async () => {
		const engine = await makeEngine({ sources: {}, strict: { types: true } })
		expect(contribution(engine)?.propertyConstraints)
			.toBeUndefined()
	})

	it('narrows color-governed kebab and camel properties through the generic Typegen contribution', async () => {
		const engine = await makeEngine({ sources: TOKENS, strict: { types: true } })
		const c = contribution(engine)
		expect(c?.propertyConstraints)
			.toBe('__PikaDesignTokenConstraints')
		const declarations = c?.declarations ?? ''
		expect(declarations)
			.toContain('"color"?: import("@pikacss/core").PropertyValue<')
		expect(declarations)
			.toContain('"background-color"?: import("@pikacss/core").PropertyValue<')
		expect(declarations)
			.toContain('"backgroundColor"?: import("@pikacss/core").PropertyValue<')
		expect(declarations)
			.toContain('"var(--color-primary)"')
		expect(declarations)
			.toContain('"var(--color-danger)"')
		expect(declarations).not.toContain('"var(--space-sm)" | "var(--color-primary)"')
	})

	it('keeps whitespace/fallback-tolerant var() members in the constraint declaration', async () => {
		const declarations = contribution(await makeEngine({ sources: TOKENS, strict: { types: true } }))?.declarations ?? ''
		expect(declarations)
			.toContain('`var(${string}--color-primary${string})`')
		expect(declarations)
			.toContain('`var(--color-primary, ${string})`')
	})

	it('narrows dimension-governed properties to dimension token/value members', async () => {
		const declarations = contribution(await makeEngine({ sources: TOKENS, strict: { types: true } }))?.declarations ?? ''
		const paddingAlias = strictAliasForProperty(declarations, 'padding')
		expect(paddingAlias)
			.toContain('\"var(--space-sm)\"')
		expect(paddingAlias)
			.toContain('\"0\"')
		expect(paddingAlias)
			.toContain('\"auto\"')
		expect(paddingAlias).not.toContain('\"var(--color-primary)\"')
	})

	it('governs every mapped property and emits both kebab/camel spellings where applicable', async () => {
		const declarations = contribution(await makeEngine({ sources: TOKENS, strict: { types: true } }))?.declarations ?? ''
		for (const property of ['background-color', 'border-color', 'width', 'font-size', 'fontSize']) {
			expect(declarations)
				.toContain(`${JSON.stringify(property)}?:`)
		}
	})

	it('narrows a $type without a built-in allowlist to tokens, keywords, and functions', async () => {
		const declarations = contribution(await makeEngine({ sources: TOKENS, strict: { types: true } }))?.declarations ?? ''
		const zIndexAlias = strictAliasForProperty(declarations, 'z-index')
		expect(zIndexAlias)
			.toContain('\"var(--z-layer-base)\"')
		expect(zIndexAlias)
			.toContain('__PikaDesignTokenStrictShared')
		expect(declarations)
			.toContain('type __PikaDesignTokenStrictShared = \"inherit\"')
		expect(declarations)
			.toContain('`calc(${string})`')
		expect(zIndexAlias).not.toContain('\"transparent\"')
		expect(zIndexAlias).not.toContain('\"auto\"')
	})

	it('includes string allowedValues as literal members', async () => {
		const declarations = contribution(await makeEngine({ sources: TOKENS, strict: { types: true, allowedValues: ['0', 'fit-content'] } }))?.declarations ?? ''
		expect(declarations)
			.toContain('"fit-content"')
	})

	it('disables narrowing entirely when a RegExp allowedValue is present', async () => {
		const engine = await makeEngine({ sources: TOKENS, strict: { types: true, allowedValues: [/^var\(--legacy-/] } })
		expect(contribution(engine)?.propertyConstraints)
			.toBeUndefined()
	})
})
