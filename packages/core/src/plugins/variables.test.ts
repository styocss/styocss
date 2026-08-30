import { describe, expect, it, vi } from 'vitest'

import { createEngine, renderPreflightDefinition } from '../engine'
import { extractUsedVarNames, extractUsedVarNamesFromPreflightResult, normalizeVariableName } from './variables'

describe('variables helpers', () => {
	it('extracts and normalizes referenced variable names from strings and preflight objects', () => {
		expect(extractUsedVarNames('color: var(--fg); background: var(--bg);'))
			.toEqual(['--fg', '--bg'])
		expect(normalizeVariableName('tone'))
			.toBe('--tone')
		expect(extractUsedVarNamesFromPreflightResult({
			':root': { '--fg': 'var(--bg)' },
			'body': { color: 'var(--accent)' },
		}))
			.toEqual(['--bg', '--accent'])
		expect(extractUsedVarNamesFromPreflightResult('border-color: var(--border);'))
			.toEqual(['--border'])
	})
})

describe('variables plugin', () => {
	it('renders transitively used variables and emits deterministic domain-owned Typegen metadata', async () => {
		const diagnostics: { code: string, level: string, message: string }[] = []
		const engine = await createEngine({
			preflights: [{ body: { color: 'var(--alias)' } }],
			variables: {
				definitions: {
					'--color': {
						value: '#fff',
						suggest: { asValueOf: '*' },
						description: 'Primary color',
					},
					'[data-theme="dark"]': {
						'--color': { value: '#000' },
					},
					'--alias': {
						value: 'var(--color)',
						suggest: { asValueOf: ['backgroundColor'], asProperty: false },
					},
					'--manual': { value: null as any, suggest: { asValueOf: false } },
					'.invalid': 'broken' as any,
				},
			},
		}, { onDiagnostic: diagnostic => diagnostics.push(diagnostic) })

		await engine.use({ color: 'var(--alias)' })
		const preflights = await engine.renderPreflights(false)
		expect(preflights)
			.toContain(':root{--color:#fff;--alias:var(--color);}')
		expect(preflights)
			.toContain('[data-theme="dark"]{--color:#000;}')
		expect(preflights.includes('--manual'))
			.toBe(false)

		const variableNamespace = engine.pika.getStatic('var') as Record<string, unknown>
		expect(variableNamespace['--color'])
			.toBe('var(--color)')
		expect(variableNamespace['--alias'])
			.toBe('var(--alias)')

		const contribution = engine.typegen.snapshot.contributions.find(({ id }) => id === 'core:variables')
		expect(contribution?.pika)
			.toEqual({ var: '__PikaVariables' })
		expect(contribution?.cssProperties)
			.toBe('__PikaVariableProperties')
		expect(contribution?.cssPropertyValues)
			.toBe('__PikaVariablePropertyValues')
		expect(contribution?.declarations)
			.toContain('"--color": "var(--color)"')
		expect(contribution?.declarations)
			.toContain('"*": "var(--color)"')
		expect(contribution?.declarations)
			.toContain('"backgroundColor": "var(--alias)"')
		expect(contribution?.declarations)
			.toContain('Primary color')
		expect(diagnostics)
			.toContainEqual(expect.objectContaining({
				level: 'warning',
				code: 'variables-invalid-scope',
				message: expect.stringContaining('Invalid variables scope for selector ".invalid"'),
			}))
	})

	it('renders nested selector scope accurately in generated variable hover previews', async () => {
		const engine = await createEngine({
			variables: {
				definitions: {
					'@media (min-width: 40rem)': {
						'.theme': {
							'--nested': { value: 'red', description: 'Nested variable' },
						},
					},
				},
			},
		})

		const declarations = engine.typegen.snapshot.contributions.find(({ id }) => id === 'core:variables')?.declarations ?? ''
		expect(declarations)
			.toContain('@media (min-width: 40rem) {')
		expect(declarations)
			.toContain('  .theme {')
		expect(declarations)
			.toContain('    --nested: red;')
		expect(declarations)
			.toContain(`\u2060@media (min-width: 40rem) {`)
		expect(declarations)
			.not.toContain('\u200E')
	})

	it('supports external variables for authoring/typegen without emitting CSS and rejects scoped externals', async () => {
		const diagnostics: { code: string }[] = []
		const engine = await createEngine({
			variables: {
				definitions: {
					'--external-brand': {
						external: true,
						suggest: { asValueOf: 'color' },
						description: 'Provided by host CSS',
					},
					'.theme': {
						'--scoped-external': { external: true },
					},
				},
			},
		}, { onDiagnostic: diagnostic => diagnostics.push(diagnostic) })

		await engine.use({ color: 'var(--external-brand)' })
		expect(await engine.renderPreflights(false))
			.not.toContain('--external-brand:')

		const variableNamespace = engine.pika.getStatic('var') as Record<string, unknown>
		expect(variableNamespace['--external-brand'])
			.toBe('var(--external-brand)')
		expect(variableNamespace['--scoped-external'])
			.toBeUndefined()

		const declarations = engine.typegen.snapshot.contributions.find(({ id }) => id === 'core:variables')?.declarations ?? ''
		expect(declarations)
			.toContain('"--external-brand": "var(--external-brand)"')
		expect(declarations)
			.toContain('"color": "var(--external-brand)"')
		expect(declarations)
			.toContain('Provided by host CSS')
		expect(diagnostics)
			.toContainEqual(expect.objectContaining({ code: 'variables-scoped-external' }))
	})

	it('rejects primitive variable leaves at runtime instead of restoring the legacy shorthand', async () => {
		const diagnostics: { code: string }[] = []
		const engine = await createEngine({
			variables: {
				definitions: { '--legacy': 'red' as any },
			},
		}, { onDiagnostic: diagnostic => diagnostics.push(diagnostic) })

		expect((engine.pika.getStatic('var') as Record<string, unknown>)['--legacy'])
			.toBeUndefined()
		expect(diagnostics)
			.toContainEqual(expect.objectContaining({ code: 'variables-invalid-leaf' }))
	})

	it('merges definitions in order and lets later entries override earlier ones', async () => {
		const engine = await createEngine({
			variables: {
				definitions: [
					{ '--shared': { value: 'red' } },
					{
						'--shared': { value: 'pink', suggest: { asValueOf: false } },
						'--plain': { value: '1rem' },
					},
				],
			},
		})

		await engine.use({ color: 'var(--shared)', margin: 'var(--plain)' })
		expect(await engine.renderPreflights(false))
			.toContain(':root{--shared:pink;--plain:1rem;}')
		const declarations = engine.typegen.snapshot.contributions.find(({ id }) => id === 'core:variables')?.declarations ?? ''
		expect(declarations)
			.not.toContain('"*": "var(--plain)"')
	})

	it('keeps safe-listed and pruneUnused=false variables even when they are not referenced', async () => {
		const engine = await createEngine({
			variables: {
				safeList: ['--safe'],
				definitions: {
					'--safe': { value: 'red' },
					'--kept': { value: 'blue', pruneUnused: false },
				},
			},
		})
		expect(await engine.renderPreflights(false))
			.toContain(':root{--safe:red;--kept:blue;}')
	})

	it('emits the transitive dependencies of safe-listed and pruneUnused=false variables', async () => {
		const engine = await createEngine({
			variables: {
				safeList: ['--alias'],
				definitions: {
					'--alias': { value: 'var(--base)' },
					'--base': { value: 'red' },
					'--kept': { value: 'var(--kept-dep)', pruneUnused: false },
					'--kept-dep': { value: 'blue' },
				},
			},
		})
		const preflights = await engine.renderPreflights(false)
		expect(preflights)
			.toContain('--alias:var(--base)')
		expect(preflights)
			.toContain('--base:red')
		expect(preflights)
			.toContain('--kept-dep:blue')
	})

	it('detects variable references containing whitespace inside var()', async () => {
		const engine = await createEngine({ variables: { definitions: { '--sp': { value: '4px' } } } })
		await engine.use({ margin: 'var( --sp )' })
		expect(await engine.renderPreflights(false))
			.toContain('--sp:4px')
	})

	it('scopes variable pruning to usedAtomicStyleIds when provided', async () => {
		const engine = await createEngine({
			variables: {
				definitions: {
					'--used': { value: 'red' },
					'--stale': { value: 'blue' },
				},
			},
		})
		const usedIds = await engine.use({ color: 'var(--used)' })
		await engine.use({ background: 'var(--stale)' })
		const scoped = await engine.renderPreflights(false, { usedAtomicStyleIds: usedIds })
		expect(scoped)
			.toContain('--used:red')
		expect(scoped).not.toContain('--stale')
		expect(await engine.renderPreflights(false))
			.toContain('--stale:blue')
	})

	it('exposes a readonly transitive atomic variable-usage query without exposing the store', async () => {
		const engine = await createEngine({
			variables: {
				definitions: {
					'--entry': { value: 'var(--alias)' },
					'--alias': { value: 'var(--base)' },
					'--base': { value: 'red' },
					'--unused': { value: 'blue', pruneUnused: false },
					'--host': { external: true },
				},
			},
		})

		await engine.use({ color: 'var(--entry)', background: 'var(--missing)' })
		const used = engine.getUsedVariableNames()

		expect(used)
			.toEqual(new Set(['--entry', '--missing', '--alias', '--base']))
		expect(used.has('--unused'))
			.toBe(false)
		expect(used.has('--host'))
			.toBe(false)
		expect('variables' in engine)
			.toBe(false)
	})

	it('executes each user preflight function only once per render pass', async () => {
		const fn = vi.fn(() => ({ body: { color: 'var(--fg)' } }))
		const engine = await createEngine({
			preflights: [fn],
			variables: { definitions: { '--fg': { value: 'black' } } },
		})
		const css = await engine.renderPreflights(false)
		expect(fn)
			.toHaveBeenCalledTimes(1)
		expect(css)
			.toContain('--fg:black')
	})

	it('ignores failing auxiliary preflights and missing referenced variables while still rendering known ones', async () => {
		const engine = await createEngine({
			preflights: [
				() => { throw new Error('boom') },
				{ body: { color: 'var(--missing)' } },
			],
			variables: { definitions: { '--size': { value: '1rem' } } },
		})
		await engine.use({ margin: 'var(--size)' })
		const variablesPreflight = engine.config.preflights.find(preflight => preflight.id === 'core:variables')!
		const rendered = await renderPreflightDefinition({
			engine,
			preflightDefinition: await variablesPreflight.fn(engine, false) as any,
			isFormatted: false,
		})
		expect(rendered)
			.toContain(':root{--size:1rem;}')
	})

	it('expands duplicate transitive refs without duplicating emitted leaves', async () => {
		const engine = await createEngine({
			variables: {
				definitions: {
					'--base': { value: 'red' },
					'--alias-a': { value: 'var(--base)' },
					'--alias-b': { value: 'var(--base)' },
					'--entry': { value: 'var(--alias-a) var(--alias-b)' },
				},
			},
		})
		await engine.use({ color: 'var(--entry)' })
		const css = await engine.renderPreflights(false)
		expect(css)
			.toContain('--entry:var(--alias-a) var(--alias-b);')
		expect(css)
			.toContain('--alias-a:var(--base);')
		expect(css)
			.toContain('--alias-b:var(--base);')
		expect(css.match(/--base:red;/g))
			.toHaveLength(1)
	})

	it('skips null-valued entries and missing varMap entries during transitive expansion', async () => {
		const engine = await createEngine({
			variables: {
				definitions: {
					'--null-val': { value: null as any },
					'--refs-null': { value: 'var(--null-val) var(--nonexistent)' },
				},
			},
		})
		await engine.use({ color: 'var(--refs-null)' })
		const css = await engine.renderPreflights(false)
		expect(css)
			.toContain('--refs-null:var(--null-val) var(--nonexistent);')
		expect(css.includes('--null-val:'))
			.toBe(false)
	})

	it('expands transitive variable references through tuple-valued fallback entries', async () => {
		const engine = await createEngine({
			variables: {
				definitions: {
					'--base': { value: '1px' },
					'--with-fallback': { value: ['var(--base)', ['solid']] },
				},
			},
		})
		await engine.use({ border: 'var(--with-fallback)' })
		const css = await engine.renderPreflights(false)
		expect(css)
			.toContain('--base:1px;')
		expect(css)
			.toContain('--with-fallback:var(--base);')
	})

	it('skips null and non-string preflight values in helper extraction', () => {
		expect(extractUsedVarNamesFromPreflightResult({
			body: null as any,
			html: {
				color: 'var(--tone)',
				opacity: 0.5 as any,
				nested: { backgroundColor: 'var(--tone)' },
			},
		}))
			.toEqual(['--tone', '--tone'])
	})
})
