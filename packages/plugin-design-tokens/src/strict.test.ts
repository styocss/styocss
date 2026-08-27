import type { Diagnostic, Engine, Variable } from '@pikacss/core'
import type { TokenIR } from './ir'
import type { TokenLayer } from './types'
import { createEngine } from '@pikacss/core'
import { describe, expect, it } from 'vitest'

import { designTokens } from './index'
import { buildStrictContext, checkDeclaration, isStrictActive } from './strict'
import { getTokenTypeNames } from './type-registry'

// A small typed color + dimension token set reused across most cases.
const TOKENS = {
	color: {
		primary: { $value: '#3b82f6', $type: 'color' },
		danger: { $value: '#ef4444', $type: 'color' },
	},
	space: {
		sm: { $value: '8px', $type: 'dimension' },
		lg: { $value: '16px', $type: 'dimension' },
	},
}

// Primitive / semantic layered color tokens for semanticOnly cases.
const LAYERED_SOURCES = [
	{ source: { color: { grey: { 100: { $value: '#f0f0f0', $type: 'color' } } } }, layer: 'primitive' as const },
	{ source: { surface: { bg: { $value: '{color.grey.100}', $type: 'color' } } }, layer: 'semantic' as const },
]

// Extracts the CSS property named in a strict-value / semantic-only / deprecated
// diagnostic message (`... on "background-color" ...` / `... on shorthand "border" ...`).
function propOf(message: string): string | undefined {
	return message.match(/on (?:shorthand )?"([^"]+)"/)?.[1]
}

async function makeEngine(designTokensConfig: any): Promise<{ engine: Engine, diagnostics: Diagnostic[] }> {
	const diagnostics: Diagnostic[] = []
	const engine = await createEngine(
		{
			plugins: [designTokens()],
			designTokens: { pruneUnused: false, ...designTokensConfig },
		},
		{ onDiagnostic: d => diagnostics.push(d) },
	)
	return { engine, diagnostics }
}

// Clears previously-collected diagnostics, applies the style items, and returns
// the diagnostics produced by that transform pass.
async function useAndCollect(engine: Engine, diagnostics: Diagnostic[], ...items: any[]): Promise<Diagnostic[]> {
	diagnostics.length = 0
	await engine.use(...items)
	return diagnostics
}

function variableLeaf(engine: Engine, varName: string): Variable | undefined {
	const definitions = [engine.config.rawConfig.variables?.definitions ?? []].flat()
	for (let index = definitions.length - 1; index >= 0; index--) {
		const value = definitions[index]?.[varName]
		if (value != null && typeof value === 'object' && ('value' in value || 'external' in value))
			return value as Variable
	}
	return undefined
}

function propsForVar(engine: Engine, varName: string): string[] {
	const asValueOf = variableLeaf(engine, varName)?.suggest?.asValueOf
	return asValueOf === false || asValueOf == null
		? []
		: [asValueOf].flat()
				.map(String)
				.sort()
}

function hasExtraProperty(engine: Engine, varName: string): boolean {
	return variableLeaf(engine, varName)?.suggest?.asProperty ?? true
}

describe('strict mode: diagnostics surface', () => {
	it('exposes report but no legacy strictTypes side channel when strict is off', async () => {
		const { engine } = await makeEngine({ sources: TOKENS, strict: { level: 'off' } })
		expect(typeof engine.designTokens?.report)
			.toBe('function')
		expect('strictTypes' in engine.designTokens!)
			.toBe(false)
	})

	it('exposes the surface and emits nothing when no designTokens config is present', async () => {
		const diagnostics: Diagnostic[] = []
		const engine = await createEngine(
			{ plugins: [designTokens()] },
			{ onDiagnostic: d => diagnostics.push(d) },
		)
		expect(typeof engine.designTokens?.report)
			.toBe('function')
		expect(await useAndCollect(engine, diagnostics, { backgroundColor: 'red' }))
			.toEqual([])
	})

	it('emits one diagnostic per violation through onDiagnostic', async () => {
		const { engine, diagnostics } = await makeEngine({ sources: TOKENS, strict: { level: 'error' } })
		expect(await useAndCollect(engine, diagnostics, { backgroundColor: 'red' }))
			.toHaveLength(1)
	})
})

describe('strict mode: off / zero-cost path', () => {
	it('emits no diagnostics when the level is off', async () => {
		const { engine, diagnostics } = await makeEngine({ sources: TOKENS, strict: { level: 'off' } })
		expect(await useAndCollect(engine, diagnostics, { backgroundColor: 'red', width: '10px' }))
			.toEqual([])
	})

	it('emits no diagnostics when strict is entirely absent', async () => {
		const { engine, diagnostics } = await makeEngine({ sources: TOKENS })
		expect(await useAndCollect(engine, diagnostics, { backgroundColor: 'red' }))
			.toEqual([])
	})
})

describe('strict mode: severity', () => {
	it('maps warn to a warning level', async () => {
		const { engine, diagnostics } = await makeEngine({ sources: TOKENS, strict: { level: 'warn' } })
		const diags = await useAndCollect(engine, diagnostics, { backgroundColor: 'red' })
		expect(diags)
			.toHaveLength(1)
		expect(diags[0]!.level)
			.toBe('warning')
		expect(diags[0]!.code)
			.toBe('strict-value')
		expect(diags[0]!.plugin)
			.toBe('design-tokens')
		expect(propOf(diags[0]!.message))
			.toBe('background-color')
		expect(diags[0]!.message)
			.toContain('"red"')
	})

	it('maps error to an error level', async () => {
		const { engine, diagnostics } = await makeEngine({ sources: TOKENS, strict: { level: 'error' } })
		const diags = await useAndCollect(engine, diagnostics, { backgroundColor: 'red' })
		expect(diags[0]!.level)
			.toBe('error')
	})
})

describe('strict mode: override precedence', () => {
	it('property key beats $type key beats level', async () => {
		const { engine, diagnostics } = await makeEngine({
			sources: TOKENS,
			strict: {
				level: 'warn',
				// `background-color` is a property key; `color` is the $type key.
				overrides: { 'background-color': 'error', 'color': 'off' },
			},
		})
		const diags = await useAndCollect(engine, diagnostics, { backgroundColor: 'red', fill: 'red', width: '10px' })
		const byProp = Object.fromEntries(diags.map(d => [propOf(d.message), d.level]))
		// property-key override wins
		expect(byProp['background-color'])
			.toBe('error')
		// $type-key override ('color' -> off) suppresses the color-typed `fill`
		expect(byProp.fill)
			.toBeUndefined()
		// no override for width/dimension -> falls back to level 'warn'
		expect(byProp.width)
			.toBe('warning')
	})

	it('runs governed checks via an override while level is off, and level-gates deprecated', async () => {
		const { engine, diagnostics } = await makeEngine({
			sources: { color: { old: { $value: '#000000', $type: 'color', $deprecated: true } } },
			strict: { level: 'off', overrides: { 'background-color': 'error' } },
		})
		const diags = await useAndCollect(
			engine,
			diagnostics,
			// valid color-typed token, but deprecated: deprecated check is gated on
			// level !== 'off', so nothing is reported here.
			{ backgroundColor: 'var(--color-old)' },
			// literal value violates the property-key override.
			{ backgroundColor: 'red' },
		)
		expect(diags)
			.toHaveLength(1)
		expect(diags[0]!.level)
			.toBe('error')
		expect(diags[0]!.message)
			.toContain('"red"')
	})
})

describe('strict mode: value validity (rule 4)', () => {
	it('accepts a token var of the governing $type', async () => {
		const { engine, diagnostics } = await makeEngine({ sources: TOKENS, strict: { level: 'error' } })
		expect(await useAndCollect(engine, diagnostics, { backgroundColor: 'var(--color-primary)' }))
			.toEqual([])
	})

	it('rejects a token var of the wrong $type', async () => {
		const { engine, diagnostics } = await makeEngine({ sources: TOKENS, strict: { level: 'error' } })
		const diags = await useAndCollect(engine, diagnostics, { backgroundColor: 'var(--space-sm)' })
		expect(diags)
			.toHaveLength(1)
		expect(diags[0]!.code)
			.toBe('strict-value')
	})

	it('accepts CSS-wide keywords', async () => {
		const { engine, diagnostics } = await makeEngine({ sources: TOKENS, strict: { level: 'error' } })
		expect(await useAndCollect(engine, diagnostics, { color: 'inherit' }, { width: 'unset' }, { color: 'revert-layer' }))
			.toEqual([])
	})

	it('accepts the built-in per-$type allowlist', async () => {
		const { engine, diagnostics } = await makeEngine({ sources: TOKENS, strict: { level: 'error' } })
		expect(await useAndCollect(
			engine,
			diagnostics,
			{ backgroundColor: 'transparent' },
			{ color: 'currentColor' },
			{ width: '0' },
			{ height: 'auto' },
		))
			.toEqual([])
	})

	it('accepts user allowedValues by exact string and by RegExp', async () => {
		const { engine, diagnostics } = await makeEngine({
			sources: TOKENS,
			strict: { level: 'error', allowedValues: ['papayawhip', /^#legacy/] },
		})
		expect(await useAndCollect(engine, diagnostics, { color: 'papayawhip' }, { backgroundColor: '#legacy-blue' }))
			.toEqual([])
	})

	it('accepts a functional value whose every var() ref is a token', async () => {
		const { engine, diagnostics } = await makeEngine({ sources: TOKENS, strict: { level: 'error' } })
		expect(await useAndCollect(
			engine,
			diagnostics,
			{ width: 'calc(var(--space-sm) * 2)' },
			{ backgroundColor: 'color-mix(in srgb, var(--color-primary), var(--color-danger))' },
		))
			.toEqual([])
	})

	it('rejects a functional value referencing an unknown var', async () => {
		const { engine, diagnostics } = await makeEngine({ sources: TOKENS, strict: { level: 'error' } })
		const diags = await useAndCollect(engine, diagnostics, { width: 'calc(var(--nope) * 2)' })
		expect(diags)
			.toHaveLength(1)
		expect(diags[0]!.code)
			.toBe('strict-value')
	})

	it('rejects a functional value with no var() references', async () => {
		const { engine, diagnostics } = await makeEngine({ sources: TOKENS, strict: { level: 'error' } })
		expect(await useAndCollect(engine, diagnostics, { width: 'calc(100% - 8px)' }))
			.toHaveLength(1)
	})
})

describe('strict mode: shorthand color literals (rule 5)', () => {
	it('flags a literal color inside a shorthand', async () => {
		const { engine, diagnostics } = await makeEngine({ sources: TOKENS, strict: { level: 'error' } })
		const diags = await useAndCollect(engine, diagnostics, { border: '1px solid #ffffff' })
		expect(diags)
			.toHaveLength(1)
		expect(diags[0]!.code)
			.toBe('strict-value')
		expect(propOf(diags[0]!.message))
			.toBe('border')
		expect(diags[0]!.level)
			.toBe('error')
	})

	it('flags rgb()/hsl() literals in border-* variants too', async () => {
		const { engine, diagnostics } = await makeEngine({ sources: TOKENS, strict: { level: 'warn' } })
		const diags = await useAndCollect(engine, diagnostics, { borderTop: '1px solid rgb(1, 2, 3)' })
		expect(diags)
			.toHaveLength(1)
		expect(propOf(diags[0]!.message))
			.toBe('border-top')
	})

	it('ignores lengths inside a shorthand (best-effort ceiling)', async () => {
		const { engine, diagnostics } = await makeEngine({ sources: TOKENS, strict: { level: 'error' } })
		expect(await useAndCollect(engine, diagnostics, { border: '10px' }))
			.toEqual([])
	})

	it('accepts a token var inside a shorthand', async () => {
		const { engine, diagnostics } = await makeEngine({ sources: TOKENS, strict: { level: 'error' } })
		expect(await useAndCollect(engine, diagnostics, { border: '1px solid var(--color-primary)' }))
			.toEqual([])
	})

	it('does not scan shorthands when no color token exists', async () => {
		const { engine, diagnostics } = await makeEngine({
			sources: { space: { sm: { $value: '8px', $type: 'dimension' } } },
			strict: { level: 'error' },
		})
		expect(await useAndCollect(engine, diagnostics, { border: '1px solid #fff' }))
			.toEqual([])
	})
})

describe('strict mode: did-you-mean (rule 6)', () => {
	it('suggests the nearest color token for a near-miss hex', async () => {
		const { engine, diagnostics } = await makeEngine({ sources: TOKENS, strict: { level: 'warn' } })
		const diags = await useAndCollect(engine, diagnostics, { backgroundColor: '#3b82f7' })
		expect(diags[0]!.message)
			.toContain('Did you mean var(--color-primary)?')
	})

	it('suggests the nearest same-unit dimension token', async () => {
		const { engine, diagnostics } = await makeEngine({ sources: TOKENS, strict: { level: 'warn' } })
		const diags = await useAndCollect(engine, diagnostics, { width: '9px' })
		expect(diags[0]!.message)
			.toContain('Did you mean var(--space-sm)?')
	})

	it('omits the suggestion when a color value is not parseable', async () => {
		const { engine, diagnostics } = await makeEngine({ sources: TOKENS, strict: { level: 'warn' } })
		const diags = await useAndCollect(engine, diagnostics, { backgroundColor: 'notacolor' })
		expect(diags[0]!.message)
			.not
			.toContain('Did you mean')
	})

	it('omits the dimension suggestion when no token shares the unit', async () => {
		const { engine, diagnostics } = await makeEngine({ sources: TOKENS, strict: { level: 'warn' } })
		const diags = await useAndCollect(engine, diagnostics, { width: '9rem' })
		expect(diags[0]!.message)
			.not
			.toContain('Did you mean')
	})
})

describe('strict mode: deprecated usage (rule 7)', () => {
	it('warns on deprecated token usage on a governed property', async () => {
		const { engine, diagnostics } = await makeEngine({
			sources: { color: { old: { $value: '#000000', $type: 'color', $deprecated: true } } },
			strict: { level: 'error' },
		})
		const diags = await useAndCollect(engine, diagnostics, { color: 'var(--color-old)' })
		expect(diags)
			.toHaveLength(1)
		expect(diags[0]!.code)
			.toBe('deprecated-token')
		// deprecated is always a warning, independent of the configured level
		expect(diags[0]!.level)
			.toBe('warning')
		expect(propOf(diags[0]!.message))
			.toBe('color')
		expect(diags[0]!.message)
			.toContain('var(--color-old)')
	})

	it('warns on deprecated usage even on a non-governed property', async () => {
		const { engine, diagnostics } = await makeEngine({
			sources: { color: { old: { $value: '#000', $type: 'color', $deprecated: true } } },
			strict: { level: 'warn' },
		})
		const diags = await useAndCollect(engine, diagnostics, { boxShadow: '0 0 0 var(--color-old)' })
		expect(diags.map(d => d.code))
			.toContain('deprecated-token')
	})
})

describe('strict mode: semanticOnly (rule 8)', () => {
	it('flags a primitive-layer token reference', async () => {
		const { engine, diagnostics } = await makeEngine({ sources: LAYERED_SOURCES, strict: { level: 'error', semanticOnly: true } })
		const diags = await useAndCollect(engine, diagnostics, { backgroundColor: 'var(--color-grey-100)' })
		expect(diags)
			.toHaveLength(1)
		expect(diags[0]!.code)
			.toBe('semantic-only')
		expect(diags[0]!.level)
			.toBe('error')
	})

	it('accepts a semantic-layer token reference', async () => {
		const { engine, diagnostics } = await makeEngine({ sources: LAYERED_SOURCES, strict: { level: 'error', semanticOnly: true } })
		expect(await useAndCollect(engine, diagnostics, { backgroundColor: 'var(--surface-bg)' }))
			.toEqual([])
	})

	it('does not flag primitive refs when semanticOnly is off', async () => {
		const { engine, diagnostics } = await makeEngine({ sources: LAYERED_SOURCES, strict: { level: 'error' } })
		expect(await useAndCollect(engine, diagnostics, { backgroundColor: 'var(--color-grey-100)' }))
			.toEqual([])
	})

	it('hides primitive-layer tokens from autocomplete at emit time', async () => {
		const { engine } = await makeEngine({ sources: LAYERED_SOURCES, strict: { level: 'error', semanticOnly: true } })
		expect(propsForVar(engine, '--color-grey-100'))
			.toEqual([])
		expect(hasExtraProperty(engine, '--color-grey-100'))
			.toBe(false)
		// The semantic token remains suggested for color properties.
		expect(propsForVar(engine, '--surface-bg').length)
			.toBeGreaterThan(0)
	})

	it('keeps primitive-layer tokens in autocomplete when semanticOnly is off', async () => {
		const { engine } = await makeEngine({ sources: LAYERED_SOURCES, strict: { level: 'off' } })
		expect(propsForVar(engine, '--color-grey-100').length)
			.toBeGreaterThan(0)
		expect(hasExtraProperty(engine, '--color-grey-100'))
			.toBe(true)
	})
})

describe('strict mode: type registry', () => {
	it('records var name -> $type for governed resolution', async () => {
		// The registry is exercised indirectly: a color-typed token var passes on a
		// color property but a dimension-typed one does not.
		const { engine, diagnostics } = await makeEngine({ sources: TOKENS, strict: { level: 'error' } })
		expect(await useAndCollect(engine, diagnostics, { color: 'var(--color-primary)' }))
			.toEqual([])
		expect(await useAndCollect(engine, diagnostics, { color: 'var(--space-sm)' }))
			.toHaveLength(1)
	})

	it('returns an empty map for an engine with no recorded types', () => {
		expect([...getTokenTypeNames({})])
			.toEqual([])
	})

	it('records only tokens that carry a $type', async () => {
		const { engine } = await makeEngine({
			sources: {
				color: { primary: { $value: '#3b82f6', $type: 'color' } },
				// no $type -> excluded from the registry
				misc: { thing: { $value: 'x' } },
			},
		})
		expect(new Map(getTokenTypeNames(engine)))
			.toEqual(new Map([['--color-primary', 'color']]))
	})
})

describe('strict internals (direct)', () => {
	function value(path: string[], type: string, val: string, themed = false): TokenIR {
		return {
			path,
			type,
			kind: { t: 'value', value: val },
			...(themed ? { themeScope: { selector: '.dark' } } : {}),
		}
	}

	// Base color + dimension tokens.
	const baseIr = [
		value(['color', 'primary'], 'color', '#3b82f6'),
		value(['color', 'danger'], 'color', '#ef4444'),
		value(['space', 'sm'], 'dimension', '8px'),
	]
	const ctx = buildStrictContext(baseIr, { strict: { level: 'error' } } as any, '', new Set(), new Map())

	function run(property: string, val: unknown): Diagnostic[] {
		const out: Diagnostic[] = []
		checkDeclaration(property, val, ctx, d => out.push(d))
		return out
	}

	it('isStrictActive: false when level off and every override off', () => {
		const off = buildStrictContext([], { strict: { level: 'off', overrides: { x: 'off' } } } as any, '', new Set(), new Map())
		expect(isStrictActive(off))
			.toBe(false)
	})

	it('isStrictActive: true when an override is not off', () => {
		const on = buildStrictContext([], { strict: { level: 'off', overrides: { x: 'error' } } } as any, '', new Set(), new Map())
		expect(isStrictActive(on))
			.toBe(true)
	})

	it('skips engine pseudo properties (__*)', () => {
		expect(run('__important', true))
			.toEqual([])
	})

	it('leaves custom properties (--*) unkebabed and ungoverned', () => {
		expect(run('--my-var', 'red'))
			.toEqual([])
	})

	it('skips non-property values (nested objects)', () => {
		expect(run('foo', { bar: 'baz' }))
			.toEqual([])
	})

	it('checks numeric values', () => {
		expect(run('width', 8))
			.toHaveLength(1)
	})

	it('checks each entry of a [primary, fallbacks] tuple', () => {
		expect(run('backgroundColor', ['red', ['blue']]))
			.toHaveLength(2)
	})

	it('expands a 3-digit hex when suggesting the nearest color', () => {
		const diags = run('backgroundColor', '#abc')
		expect(diags)
			.toHaveLength(1)
		expect(diags[0]!.message)
			.toContain('Did you mean')
	})

	it('parses an rgb() literal when suggesting the nearest color', () => {
		const diags = run('backgroundColor', 'rgb(59, 130, 247)')
		expect(diags[0]!.message)
			.toContain('Did you mean var(--color-primary)?')
	})

	it('omits a dimension suggestion for a malformed numeric literal', () => {
		const diags = run('width', '1.2.3px')
		expect(diags)
			.toHaveLength(1)
		expect(diags[0]!.message)
			.not
			.toContain('Did you mean')
	})

	it('omits the suggestion when the governing $type has no base tokens', () => {
		// A color token that exists only in a theme scope: the type is governed but
		// has no base candidates to suggest from.
		const themeOnly = buildStrictContext(
			[value(['color', 'primary'], 'color', '#3b82f6', true)],
			{ strict: { level: 'error' } } as any,
			'',
			new Set(),
			new Map(),
		)
		const out: Diagnostic[] = []
		checkDeclaration('backgroundColor', '#123456', themeOnly, d => out.push(d))
		expect(out)
			.toHaveLength(1)
		expect(out[0]!.message)
			.not
			.toContain('Did you mean')
	})

	it('suppresses semantic-only and shorthand checks when the effective level is off', () => {
		const layers = new Map<string, TokenLayer>([['--color-grey-100', 'primitive']])
		const suppressed = buildStrictContext(
			[value(['color', 'grey', '100'], 'color', '#f0f0f0')],
			{ strict: { level: 'error', semanticOnly: true, overrides: { 'background-color': 'off', 'border': 'off' } } } as any,
			'',
			new Set(),
			layers,
		)
		const out: Diagnostic[] = []
		checkDeclaration('backgroundColor', 'var(--color-grey-100)', suppressed, d => out.push(d))
		checkDeclaration('border', '1px solid #fff', suppressed, d => out.push(d))
		expect(out)
			.toEqual([])
	})
})
