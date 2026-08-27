import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createEngine } from '@pikacss/core'
import { join } from 'pathe'
import { describe, expect, it } from 'vitest'

import { getLayerTokenNames } from './layer'
import { designTokens } from './node'

async function renderTokensCss(designTokensConfig: any) {
	const engine = await createEngine({
		plugins: [designTokens()],
		designTokens: designTokensConfig,
	})
	const css = await engine.renderPreflights(false)
	return { engine, css }
}

describe('bottleneck G — per-source prefix', () => {
	const root = fileURLToPath(new URL('./fixtures/G-namespacing', import.meta.url))

	it('namespaces one source while another keeps the global (empty) prefix', async () => {
		const { css } = await renderTokensCss({
			pruneUnused: false,
			root,
			sources: [
				{ source: 'vendor.tokens.json', prefix: 'syno' },
				'app.tokens.json',
			],
		})

		expect(css)
			.toContain('--syno-surface-z0:var(--guideline-semantic-surface-z0)')
		expect(css)
			.toContain('--brand-primary:#3b82f6')
	})
})

describe('per-source prefix resolution', () => {
	it('addresses pika.tk through the per-source prefix ahead of the top-level prefix', async () => {
		const { engine } = await renderTokensCss({
			prefix: 'global',
			pruneUnused: false,
			sources: [
				{ source: { color: { primary: { $value: '#111' } } }, prefix: 'brand' },
			],
		})
		const tk = engine.pika.getStatic('tk') as { brand: { color: { primary: string } } }

		expect(tk.brand.color.primary)
			.toBe('var(--brand-color-primary)')
		expect((tk as Record<string, unknown>).global)
			.toBeUndefined()
	})

	it('resolves a source\'s own {a.b.c} alias within that source\'s effective prefix', async () => {
		const { css } = await renderTokensCss({
			pruneUnused: false,
			sources: [
				{
					source: {
						color: {
							primary: { $value: '#111' },
							accent: { $value: '{color.primary}' },
						},
					},
					prefix: 'syno',
				},
			],
		})
		expect(css)
			.toContain('--syno-color-primary:#111')
		expect(css)
			.toContain('--syno-color-accent:var(--syno-color-primary)')
	})

	it('names a cross-file $ref with the TARGET source\'s effective prefix', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'pika-design-tokens-'))
		await writeFile(
			join(dir, 'primitive.tokens.json'),
			JSON.stringify({ color: { grey: { 200: { $value: '#f7f7f7', $type: 'color' } } } }),
		)
		// Unprefixed source that $refs into the syno-prefixed primitive source.
		await writeFile(
			join(dir, 'semantic.tokens.json'),
			JSON.stringify({ surface: { z0: { $ref: 'primitive.tokens.json#/color/grey/200' } } }),
		)

		const { css } = await renderTokensCss({
			pruneUnused: false,
			root: dir,
			sources: [
				{ source: 'primitive.tokens.json', prefix: 'syno' },
				'semantic.tokens.json',
			],
		})

		expect(css)
			.toContain('--syno-color-grey-200:#f7f7f7')
		// The alias must point at the target's prefixed name, not the source's.
		expect(css)
			.toContain('--surface-z0:var(--syno-color-grey-200)')
	})

	it('applies a per-source prefix to a theme source too', async () => {
		const { css } = await renderTokensCss({
			pruneUnused: false,
			sources: { color: { bg: { $value: '#fff' } } },
			themes: {
				dark: {
					sources: [{ source: { color: { bg: { $value: '#000' } } }, prefix: 'syno' }],
				},
			},
		})
		expect(css)
			.toContain('.dark{--syno-color-bg:#000')
	})

	it('treats an object with a `source` property as an entry, not an inline group', async () => {
		// Inline group form nested under an entry with an explicit prefix.
		const { css } = await renderTokensCss({
			pruneUnused: false,
			sources: [
				{ source: { color: { ok: { $value: '#0f0' } } }, prefix: 'app' },
			],
		})
		expect(css)
			.toContain('--app-color-ok:#0f0')
	})
})

describe('layer registry', () => {
	it('returns an empty map for an engine with no recorded layers', () => {
		expect([...getLayerTokenNames({})])
			.toEqual([])
	})

	it('records var name → declared layer per source', async () => {
		const { engine } = await renderTokensCss({
			pruneUnused: false,
			sources: [
				{ source: { color: { grey: { 100: { $value: '#fff' } } } }, prefix: 'syno', layer: 'primitive' },
				{ source: { surface: { z0: { $value: '{color.grey.100}' } } }, layer: 'semantic' },
			],
		})

		expect(new Map(getLayerTokenNames(engine)))
			.toEqual(new Map([
				['--syno-color-grey-100', 'primitive'],
				['--surface-z0', 'semantic'],
			]))
	})
})
