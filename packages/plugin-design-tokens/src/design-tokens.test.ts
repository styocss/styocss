import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createEngine, log } from '@pikacss/core'
import { join } from 'pathe'
import { describe, expect, it, vi } from 'vitest'

import { designTokens, parseDesignMarkdown, tokenPathToVariableName } from './node'

async function renderTokensCss(designTokensConfig: any, extra: Record<string, any> = {}) {
	const engine = await createEngine({
		plugins: [designTokens()],
		designTokens: designTokensConfig,
		...extra,
	})
	const css = await engine.renderPreflights(false)
	return { engine, css }
}

describe('tokenPathToVariableName', () => {
	it('kebab-cases segments and joins with dashes', () => {
		expect(tokenPathToVariableName(['color', 'primary']))
			.toBe('--color-primary')
		expect(tokenPathToVariableName(['fontSize', 'lg']))
			.toBe('--font-size-lg')
		expect(tokenPathToVariableName(['Space Scale', '2']))
			.toBe('--space-scale-2')
	})

	it('applies the prefix as the first segment', () => {
		expect(tokenPathToVariableName(['color', 'primary'], 'app'))
			.toBe('--app-color-primary')
	})
})

describe('parseDesignMarkdown', () => {
	it('extracts base and theme token blocks and ignores other content', () => {
		const md = [
			'# Design',
			'Some prose.',
			'```tokens',
			'{ "color": { "primary": { "$value": "#3b82f6" } } }',
			'```',
			'```ts',
			'const notTokens = true',
			'```',
			'```tokens theme=dark selector=".dark"',
			'{ "color": { "primary": { "$value": "#60a5fa" } } }',
			'```',
		].join('\n')

		const { base, themeBlocks } = parseDesignMarkdown(md)
		expect(base)
			.toHaveLength(1)
		expect(themeBlocks)
			.toEqual([
				expect.objectContaining({ theme: 'dark', selector: '.dark' }),
			])
	})

	it('skips blocks with invalid JSON', () => {
		const md = [
			'```tokens',
			'{ not json',
			'```',
		].join('\n')
		const { base, themeBlocks } = parseDesignMarkdown(md)
		expect(base)
			.toHaveLength(0)
		expect(themeBlocks)
			.toHaveLength(0)
	})
})

describe('designTokens plugin', () => {
	it('emits flattened tokens as :root variables', async () => {
		const { css } = await renderTokensCss({
			pruneUnused: false,
			sources: {
				color: {
					primary: { $value: '#3b82f6', $type: 'color' },
					accent: { $value: '{color.primary}' },
				},
				spacing: { sm: { $value: '0.5rem' } },
			},
		})

		expect(css)
			.toContain('--color-primary:#3b82f6')
		expect(css)
			.toContain('--color-accent:var(--color-primary)')
		expect(css)
			.toContain('--spacing-sm:0.5rem')
	})

	it('resolves inline aliases embedded in longer values', async () => {
		const { css } = await renderTokensCss({
			pruneUnused: false,
			sources: {
				color: { border: { $value: '#e5e7eb' } },
				border: { default: { $value: '1px solid {color.border}' } },
			},
		})
		expect(css)
			.toContain('--border-default:1px solid var(--color-border)')
	})

	it('applies the configured prefix to names and alias targets', async () => {
		const { css } = await renderTokensCss({
			pruneUnused: false,
			prefix: 'app',
			sources: {
				color: {
					primary: { $value: '#111' },
					accent: { $value: '{color.primary}' },
				},
			},
		})
		expect(css)
			.toContain('--app-color-primary:#111')
		expect(css)
			.toContain('--app-color-accent:var(--app-color-primary)')
	})

	it('serializes composite and array token values', async () => {
		const { css } = await renderTokensCss({
			pruneUnused: false,
			sources: {
				shadow: {
					md: {
						$type: 'shadow',
						$value: { offsetX: '0', offsetY: '4px', blur: '6px', spread: '-1px', color: 'rgb(0 0 0 / 0.1)' },
					},
					layered: {
						$type: 'shadow',
						$value: [
							{ offsetX: '0', offsetY: '1px', blur: '2px', color: '#0002' },
							{ inset: true, offsetX: '0', offsetY: '0', blur: '1px', color: '#0001' },
						],
					},
				},
				font: { sans: { $type: 'fontFamily', $value: ['Inter', 'sans-serif'] } },
				border: { thin: { $type: 'border', $value: { width: '1px', style: 'solid', color: '#ccc' } } },
			},
		})

		expect(css)
			.toContain('--shadow-md:0 4px 6px -1px rgb(0 0 0 / 0.1)')
		expect(css)
			.toContain('--shadow-layered:0 1px 2px #0002, inset 0 0 1px #0001')
		expect(css)
			.toContain('--font-sans:Inter, sans-serif')
		expect(css)
			.toContain('--border-thin:1px solid #ccc')
	})

	it('expands unknown composite values into sub-variables', async () => {
		const { css } = await renderTokensCss({
			pruneUnused: false,
			sources: {
				typography: {
					heading: {
						$type: 'typography',
						$value: { fontFamily: 'Inter', fontSize: '2rem', fontWeight: 700 },
					},
				},
			},
		})
		expect(css)
			.toContain('--typography-heading-font-family:Inter')
		expect(css)
			.toContain('--typography-heading-font-size:2rem')
		expect(css)
			.toContain('--typography-heading-font-weight:700')
	})

	it('emits theme tokens under the theme selector', async () => {
		const { css } = await renderTokensCss({
			pruneUnused: false,
			sources: { color: { bg: { $value: '#fff' } } },
			themes: {
				dark: { sources: { color: { bg: { $value: '#000' } } } },
				ocean: {
					selector: '[data-theme="ocean"]',
					sources: { color: { bg: { $value: '#001e3c' } } },
				},
			},
		})

		expect(css)
			.toContain(':root{--color-bg:#fff')
		expect(css)
			.toContain('.dark{--color-bg:#000')
		expect(css)
			.toContain('[data-theme="ocean"]{--color-bg:#001e3c')
	})

	it('prunes unused tokens by default and emits used ones', async () => {
		const engine = await createEngine({
			plugins: [designTokens()],
			designTokens: {
				sources: {
					color: {
						used: { $value: '#123456' },
						unused: { $value: '#654321' },
					},
				},
			},
		})
		await engine.use({ color: 'var(--color-used)' })
		const css = await engine.renderPreflights(false)

		expect(css)
			.toContain('--color-used:#123456')
		expect(css).not.toContain('--color-unused')
	})

	it('keeps user-defined variables alongside token variables', async () => {
		const { css } = await renderTokensCss(
			{
				pruneUnused: false,
				sources: { color: { primary: { $value: '#3b82f6' } } },
			},
			{
				variables: {
					pruneUnused: false,
					definitions: { '--custom': 'red' },
				},
			},
		)
		expect(css)
			.toContain('--custom:red')
		expect(css)
			.toContain('--color-primary:#3b82f6')
	})

	it('loads tokens from json and markdown files and registers config dependencies', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'pika-design-tokens-'))
		const jsonPath = join(dir, 'base.tokens.json')
		const mdPath = join(dir, 'design.md')
		await writeFile(jsonPath, JSON.stringify({ color: { primary: { $value: '#3b82f6' } } }))
		await writeFile(mdPath, [
			'# Design doc',
			'```tokens',
			'{ "spacing": { "sm": { "$value": "0.5rem" } } }',
			'```',
			'```tokens theme=dark',
			'{ "color": { "primary": { "$value": "#60a5fa" } } }',
			'```',
		].join('\n'))

		const engine = await createEngine({
			plugins: [designTokens()],
			designTokens: {
				pruneUnused: false,
				root: dir,
				sources: ['base.tokens.json', 'design.md'],
			},
		})
		const css = await engine.renderPreflights(false)

		expect(css)
			.toContain('--color-primary:#3b82f6')
		expect(css)
			.toContain('--spacing-sm:0.5rem')
		expect(css)
			.toContain('.dark{--color-primary:#60a5fa')
		expect(engine.configDependencies)
			.toEqual(new Set([jsonPath, mdPath]))
	})

	it('does nothing when designTokens config is absent', async () => {
		const engine = await createEngine({ plugins: [designTokens()] })
		expect(await engine.renderPreflights(false))
			.toBe('')
		expect(engine.configDependencies.size)
			.toBe(0)
	})

	it('does nothing when sources produce no tokens', async () => {
		const engine = await createEngine({
			plugins: [designTokens()],
			designTokens: { sources: {} },
		})
		expect(await engine.renderPreflights(false))
			.toBe('')
	})

	it('serializes transition composites and skips group metadata keys', async () => {
		const { css } = await renderTokensCss({
			pruneUnused: false,
			sources: {
				$description: 'group metadata is skipped',
				motion: {
					fast: { $type: 'transition', $value: { duration: '150ms', timingFunction: 'ease-out' } },
				},
			},
		})
		expect(css)
			.toContain('--motion-fast:150ms ease-out')
		expect(css).not.toContain('group metadata')
	})

	it('skips invalid token nodes and empty array values with a warning', async () => {
		const { css } = await renderTokensCss({
			pruneUnused: false,
			sources: {
				color: {
					// plain scalar without $value wrapper is invalid
					broken: '#fff' as any,
					empty: { $value: [] },
					ok: { $value: '#0f0' },
				},
			},
		})
		expect(css)
			.toContain('--color-ok:#0f0')
		expect(css).not.toContain('--color-broken')
		expect(css).not.toContain('--color-empty')
	})

	it('supports single-quoted fence attributes and fence selector precedence', () => {
		const md = [
			'```tokens theme=dark selector=\'[data-mode="dark"]\'',
			'{ "color": { "bg": { "$value": "#000" } } }',
			'```',
		].join('\n')
		const { themeBlocks } = parseDesignMarkdown(md)
		expect(themeBlocks[0])
			.toEqual(expect.objectContaining({
				theme: 'dark',
				selector: '[data-mode="dark"]',
			}))
	})

	it('prefers the fence selector over the configured theme selector', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'pika-design-tokens-'))
		const mdPath = join(dir, 'design.md')
		await writeFile(mdPath, [
			'```tokens theme=dark selector=":root.dark"',
			'{ "color": { "bg": { "$value": "#000" } } }',
			'```',
		].join('\n'))

		const { css } = await renderTokensCss({
			pruneUnused: false,
			root: dir,
			sources: ['design.md'],
			themes: { dark: { selector: '.theme-dark' } },
		})
		expect(css)
			.toContain(':root.dark{--color-bg:#000')
		expect(css).not.toContain('.theme-dark')
	})

	it('skips json source files with invalid or non-object content', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'pika-design-tokens-'))
		await writeFile(join(dir, 'broken.json'), '{ not json')
		await writeFile(join(dir, 'array.json'), '[1, 2]')

		const { css } = await renderTokensCss({
			pruneUnused: false,
			root: dir,
			sources: ['broken.json', 'array.json', { color: { ok: { $value: '#0f0' } } }],
		})
		expect(css)
			.toContain('--color-ok:#0f0')
	})

	it('skips markdown token blocks whose content is not an object', () => {
		const md = [
			'```tokens',
			'[1, 2, 3]',
			'```',
		].join('\n')
		const { base, themeBlocks } = parseDesignMarkdown(md)
		expect(base)
			.toHaveLength(0)
		expect(themeBlocks)
			.toHaveLength(0)
	})

	it('loads sources given as absolute paths and theme-only configs', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'pika-design-tokens-'))
		const jsonPath = join(dir, 'dark.tokens.json')
		await writeFile(jsonPath, JSON.stringify({ color: { bg: { $value: '#000' } } }))

		const { css } = await renderTokensCss({
			pruneUnused: false,
			themes: { dark: { sources: [jsonPath] } },
		})
		expect(css)
			.toContain('.dark{--color-bg:#000')
	})

	it('merges multiple blocks of the same theme and skips empty theme blocks', async () => {
		const md = [
			'```tokens theme=dark',
			'{ "color": { "bg": { "$value": "#000" } } }',
			'```',
			'```tokens theme=dark',
			'{ "color": { "fg": { "$value": "#fff" } } }',
			'```',
			'```tokens theme=empty',
			'{}',
			'```',
		].join('\n')
		const dir = await mkdtemp(join(tmpdir(), 'pika-design-tokens-'))
		await writeFile(join(dir, 'design.md'), md)

		const { css } = await renderTokensCss({
			pruneUnused: false,
			root: dir,
			sources: ['design.md'],
		})
		expect(css)
			.toContain('.dark{--color-bg:#000;--color-fg:#fff')
		expect(css).not.toContain('.empty')
	})

	it('defaults missing shadow offsets to zero', async () => {
		const { css } = await renderTokensCss({
			pruneUnused: false,
			sources: {
				shadow: { halo: { $type: 'shadow', $value: { blur: '8px', color: '#00f5' } } },
			},
		})
		expect(css)
			.toContain('--shadow-halo:0 0 8px #00f5')
	})

	it('skips missing source files without failing engine creation but still registers them as config dependencies', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'pika-design-tokens-'))
		const engine = await createEngine({
			plugins: [designTokens()],
			designTokens: {
				pruneUnused: false,
				root: dir,
				sources: ['missing.tokens.json', { color: { ok: { $value: '#0f0' } } }],
			},
		})
		const css = await engine.renderPreflights(false)
		expect(css)
			.toContain('--color-ok:#0f0')
		// Regression: the missing file must still be watched so creating it
		// after dev-server start triggers a config reload.
		expect(engine.configDependencies)
			.toEqual(new Set([join(dir, 'missing.tokens.json')]))
	})

	it('uses the logger as a fallback for read errors without diagnostic context', async () => {
		const errorSink = vi.fn()
		const dir = await mkdtemp(join(tmpdir(), 'pika-design-tokens-'))
		const plugin = designTokens()
		log.setErrorFn(errorSink)
		try {
			// No onDiagnostic in the context: the plugin must fall back to the
			// logger. State is still supplied, as the engine always would (#116).
			await plugin.configureRawConfig?.({
				designTokens: {
					root: dir,
					sources: ['missing.tokens.json'],
				},
			} as any, { state: plugin.createState!() } as any)
			expect(errorSink)
				.toHaveBeenCalledWith(
					expect.any(String),
					expect.stringContaining('Failed to read token source'),
					expect.any(Error),
				)
		}
		finally {
			log.setErrorFn(() => {})
		}
	})
})

describe('baseline design.md fixture', () => {
	// Wires the committed `fixtures/baseline-design.md` document through the full
	// load -> normalize -> resolve -> emit pipeline and asserts the emitted CSS
	// matches the fixture's `expected.css` semantics (base :root vars, inline
	// `{alias}` -> var(), and the theme block under its fence `selector=.dark`).
	const fixturesRoot = fileURLToPath(new URL('./fixtures', import.meta.url))

	it('emits the expected base and theme variables', async () => {
		const { css } = await renderTokensCss({
			pruneUnused: false,
			root: fixturesRoot,
			sources: ['baseline-design.md'],
		})

		expect(css)
			.toContain(':root{--color-primary:#3b82f6;--color-accent:var(--color-primary);}')
		expect(css)
			.toContain('.dark{--color-primary:#60a5fa;}')
	})
})

describe('b-multi-theme-single-file fixture (theme from / media scoping)', () => {
	// Three themes share one source file, each picking its own top-level partition
	// via `from`; the partition key is stripped so the emitted var names are
	// theme-agnostic. Each theme also carries a `media` query, so its variables are
	// emitted both under the class selector and additionally under an `@media` /
	// `:root` block. Config mirrors the fixture's `expected.css` header.
	const fixturesRoot = fileURLToPath(new URL('./fixtures', import.meta.url))

	it('emits class-scoped and @media-scoped variable sets with partition keys stripped', async () => {
		const source = 'B-multi-theme-single-file/theme.tokens.json'
		const { css } = await renderTokensCss({
			pruneUnused: false,
			root: fixturesRoot,
			sources: [],
			themes: {
				'light': {
					from: 'light-mode',
					selector: ':root, :root.light',
					media: '(prefers-color-scheme: light)',
					sources: [source],
				},
				'dark': {
					from: 'dark-mode',
					selector: ':root.dark',
					media: '(prefers-color-scheme: dark)',
					sources: [source],
				},
				'light-hc': {
					from: 'light-mode-high-contrast',
					selector: ':root.light.high-contrast',
					media: '(prefers-color-scheme: light) and (prefers-contrast: more)',
					sources: [source],
				},
			},
		})

		// Class-scoped emissions (one block per theme selector).
		expect(css)
			.toContain(':root,:root.light{--surface-z0:#f7f7f7;--text-primary:#292929;}')
		expect(css)
			.toContain(':root.dark{--surface-z0:#1c1c1c;--text-primary:#f7f7f7;}')
		expect(css)
			.toContain(':root.light.high-contrast{--surface-z0:#ffffff;--text-primary:#000000;}')

		// @media-scoped emissions (same variables, wrapped in @media { :root { ... } }).
		expect(css)
			.toContain('@media (prefers-color-scheme: light){:root{--surface-z0:#f7f7f7;--text-primary:#292929;}}')
		expect(css)
			.toContain('@media (prefers-color-scheme: dark){:root{--surface-z0:#1c1c1c;--text-primary:#f7f7f7;}}')
		expect(css)
			.toContain('@media (prefers-color-scheme: light) and (prefers-contrast: more){:root{--surface-z0:#ffffff;--text-primary:#000000;}}')

		// Partition keys never leak into the emitted variable names.
		expect(css)
			.not
			.toContain('--light-mode')
		expect(css)
			.not
			.toContain('--dark-mode')
	})
})
