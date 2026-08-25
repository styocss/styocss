import type { DesignTokensLoader, DesignTokensNormalizer, NormalizeCtx } from './types'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createEngine, log } from '@pikacss/core'
import { join } from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { designTokens } from './node'

async function renderTokensCss(designTokensConfig: any) {
	const engine = await createEngine({
		plugins: [designTokens()],
		designTokens: designTokensConfig,
	})
	const css = await engine.renderPreflights(false)
	return { engine, css }
}

describe('loader seam', () => {
	it('prefers a matching custom loader over the built-in JSON handling', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'pika-design-tokens-'))
		// Real file the built-in JSON loader would parse to a different value.
		await writeFile(join(dir, 'tokens.json'), JSON.stringify({ color: { primary: { $value: '#builtin' } } }))

		const custom: DesignTokensLoader = {
			name: 'override-json',
			match: id => id.endsWith('.json'),
			load: () => ({ color: { primary: { $value: '#custom' } } }),
		}

		const { css } = await renderTokensCss({
			pruneUnused: false,
			root: dir,
			loaders: [custom],
			sources: ['tokens.json'],
		})

		expect(css)
			.toContain('--color-primary:#custom')
		expect(css).not.toContain('#builtin')
	})

	it('falls back to the built-in loader when no custom loader matches', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'pika-design-tokens-'))
		await writeFile(join(dir, 'tokens.json'), JSON.stringify({ color: { primary: { $value: '#builtin' } } }))

		const custom: DesignTokensLoader = {
			name: 'only-yaml',
			match: id => id.endsWith('.yaml'),
			load: () => ({ color: { primary: { $value: '#custom' } } }),
		}

		const { css } = await renderTokensCss({
			pruneUnused: false,
			root: dir,
			loaders: [custom],
			sources: ['tokens.json'],
		})

		expect(css)
			.toContain('--color-primary:#builtin')
	})

	it('registers loader dependencies (including additional paths) even when the load fails', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'pika-design-tokens-'))
		const custom: DesignTokensLoader = {
			name: 'failing',
			match: id => id.endsWith('.virtual'),
			load: (id, ctx) => {
				// Register the source and an extra watched path before failing.
				ctx.addDependency(id)
				ctx.addDependency('virtual:extra-dep')
				throw new Error('boom')
			},
		}

		const engine = await createEngine({
			plugins: [designTokens()],
			designTokens: {
				pruneUnused: false,
				root: dir,
				loaders: [custom],
				sources: ['broken.virtual', { color: { ok: { $value: '#0f0' } } }],
			},
		})
		const css = await engine.renderPreflights(false)

		// The pipeline continues past the failed loader; the inline source still emits.
		expect(css)
			.toContain('--color-ok:#0f0')
		expect(engine.configDependencies.map(({ path }) => path))
			.toEqual([join(dir, 'broken.virtual'), 'virtual:extra-dep'])
	})

	it('skips a missing markdown source but still registers it as a dependency', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'pika-design-tokens-'))
		const engine = await createEngine({
			plugins: [designTokens()],
			designTokens: {
				pruneUnused: false,
				root: dir,
				sources: ['missing.md', { color: { ok: { $value: '#0f0' } } }],
			},
		})
		const css = await engine.renderPreflights(false)

		expect(css)
			.toContain('--color-ok:#0f0')
		expect(engine.configDependencies.map(({ path }) => path))
			.toEqual([join(dir, 'missing.md')])
	})

	it('exposes cwd, root, and readFile to a custom loader', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'pika-design-tokens-'))
		await writeFile(join(dir, 'raw.custom'), '#fromfile')

		const custom: DesignTokensLoader = {
			name: 'read-through',
			match: id => id.endsWith('.custom'),
			load: async (id, ctx) => {
				ctx.addDependency(id)
				const value = (await ctx.readFile(id)).trim()
				expect(ctx.root)
					.toBe(dir)
				expect(typeof ctx.cwd)
					.toBe('string')
				return { color: { primary: { $value: value } } }
			},
		}

		const { css } = await renderTokensCss({
			pruneUnused: false,
			root: dir,
			loaders: [custom],
			sources: ['raw.custom'],
		})

		expect(css)
			.toContain('--color-primary:#fromfile')
	})
})

describe('theme "from" partition', () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('warns and skips a "from" partition that is missing or not a token group', async () => {
		const warn = vi.spyOn(log, 'warn')
			.mockImplementation(() => {})

		const { css } = await renderTokensCss({
			pruneUnused: false,
			themes: {
				dark: {
					// `absent` does not exist and `notagroup` is a scalar, so both partitions
					// are warned about and skipped, leaving the theme with no tokens.
					from: ['absent', 'notagroup'],
					selector: '.dark',
					sources: [{ notagroup: 'x', valid: { $value: '#fff' } }],
				},
			},
		})

		expect(warn)
			.toHaveBeenCalledWith('[design-tokens] Theme "from" partition "absent" was not found or is not a token group. Skipping.')
		expect(warn)
			.toHaveBeenCalledWith('[design-tokens] Theme "from" partition "notagroup" was not found or is not a token group. Skipping.')
		// Nothing was picked, so no `.dark` scope is emitted.
		expect(css)
			.not
			.toContain('.dark')
	})
})

describe('normalizer chain', () => {
	it('runs normalizers in order, each receiving the previous output', async () => {
		const calls: string[] = []
		const seenIds: string[][] = []

		const first: DesignTokensNormalizer = {
			name: 'first',
			normalize: (_raw, ctx: NormalizeCtx) => {
				calls.push('first')
				seenIds.push([...ctx.sourceIds])
				return { color: { a: { $value: '1' } } }
			},
		}
		const second: DesignTokensNormalizer = {
			name: 'second',
			normalize: (raw: any, ctx: NormalizeCtx) => {
				calls.push('second')
				// Must receive the first normalizer's output, not the original raw.
				expect(raw)
					.toEqual({ color: { a: { $value: '1' } } })
				expect(ctx.id)
					.toBe('inline')
				return { ...raw, color: { ...raw.color, b: { $value: '2' } } }
			},
		}

		const { css } = await renderTokensCss({
			pruneUnused: false,
			normalizers: [first, second],
			sources: { ignored: { $value: 'x' } },
		})

		expect(calls)
			.toEqual(['first', 'second'])
		expect(seenIds)
			.toEqual([['inline']])
		expect(css)
			.toContain('--color-a:1')
		expect(css)
			.toContain('--color-b:2')
	})

	it('passes the resolved file id and sibling source ids to normalizers', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'pika-design-tokens-'))
		await writeFile(join(dir, 'a.json'), JSON.stringify({ color: { a: { $value: '#a' } } }))
		await writeFile(join(dir, 'b.json'), JSON.stringify({ color: { b: { $value: '#b' } } }))

		const seen: { id: string, sourceIds: readonly string[] }[] = []
		const spy: DesignTokensNormalizer = {
			name: 'spy',
			normalize: (raw, ctx) => {
				seen.push({ id: ctx.id, sourceIds: ctx.sourceIds })
				return raw as any
			},
		}

		await renderTokensCss({
			pruneUnused: false,
			root: dir,
			normalizers: [spy],
			sources: ['a.json', 'b.json'],
		})

		expect(seen.map(s => s.id))
			.toEqual([join(dir, 'a.json'), join(dir, 'b.json')])
		// Each normalize call sees the full sibling id set.
		for (const s of seen) {
			expect([...s.sourceIds])
				.toEqual([join(dir, 'a.json'), join(dir, 'b.json')])
		}
	})
})
