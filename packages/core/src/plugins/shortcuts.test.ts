import { describe, expect, it } from 'vitest'

import { createEngine } from '../engine'
import { defineEnginePlugin } from '../plugin'
import { renderTypegenDocument } from '../typegen/render'
import { resolveShortcutConfig } from './shortcuts'

class PreviewFailure {
	toString() { return 'string boom' }
}

describe('shortcuts plugin', () => {
	it('resolves configured shortcuts while unmatched strings remain raw classes', async () => {
		const engine = await createEngine({
			shortcuts: {
				definitions: [
					{ name: 'btn', value: { display: 'flex', alignItems: 'center' }, description: 'Button' },
					{
						pattern: /^m-(\d+)$/,
						inputType: '`m-$' + '{number}`',
						resolve: matched => ({ margin: `${matched[1]}px` }),
						autocomplete: ['m-4'],
					},
				],
			},
		})

		const ids = await engine.use('btn', 'm-4', 'raw-class')
		const css = await engine.renderAtomicStyles(false, { atomicStyleIds: ids })

		expect(css)
			.toContain('display:flex;')
		expect(css)
			.toContain('align-items:center;')
		expect(css)
			.toContain('margin:4px;')
		expect(ids)
			.toContain('raw-class')
		const before = engine.typegen.snapshot
		await engine.use('m-99')
		expect(engine.typegen.snapshot)
			.toEqual(before)
	})

	it('does not treat the removed __shortcut pseudo-property as shortcut composition', async () => {
		const engine = await createEngine({
			shortcuts: { definitions: [{ name: 'btn', value: { display: 'flex' } }] },
		})
		const ids = await engine.use({ __shortcut: 'btn' } as any)
		const css = await engine.renderAtomicStyles(false, { atomicStyleIds: ids })

		expect(css).not.toContain('display:flex')
	})

	it('accepts only the frozen object grammar and exposes no runtime add ingress', async () => {
		expect(resolveShortcutConfig({ name: 'btn', value: { display: 'flex' } }))
			.toMatchObject({ type: 'static' })
		expect(resolveShortcutConfig({
			pattern: /^m-(\d+)$/,
			inputType: '`m-$' + '{number}`',
			resolve: matched => ({ margin: `${matched[1]}px` }),
		}))
			.toMatchObject({ type: 'dynamic' })
		expect(resolveShortcutConfig(['btn', { display: 'flex' }] as any))
			.toBeUndefined()

		const engine = await createEngine()
		expect((engine as any).shortcuts)
			.toBeUndefined()
	})
})

it('owns the strict pika.sc namespace and setup-derived shortcut Typegen surface', async () => {
	const diagnostics: unknown[] = []
	const engine = await createEngine({
		shortcuts: {
			definitions: [
				{ name: 'btn', value: { display: 'flex' }, description: 'Button docs' },
				{
					pattern: /^m-(\d+)$/y,
					inputType: '`m-$' + '{number}`',
					resolve: matched => ({ margin: `${matched[1]}px` }),
					autocomplete: ['m-4', 'bad'],
					description: 'Margin docs',
				},
			],
		},
	}, { onDiagnostic: diagnostic => diagnostics.push(diagnostic) })

	const sc = engine.pika.getStatic('sc') as Record<PropertyKey, unknown>
	expect(sc.btn)
		.toBe('btn')
	expect(sc['m-4'])
		.toBe('m-4')
	expect(sc.bad)
		.toBeUndefined()
	expect(sc[Symbol.toStringTag])
		.toBeUndefined()

	const contribution = engine.typegen.snapshot.contributions.find(({ id }) => id === 'core:shortcuts')
	expect(contribution?.pika)
		.toEqual({ sc: '__PikaShortcuts' })
	expect(contribution?.declarations)
		.toContain('"btn": string')
	expect(contribution?.declarations)
		.toContain('"m-4": string')
	expect(contribution?.declarations)
		.not.toContain('"bad": string')
	expect(contribution?.declarations)
		.toContain('type __PikaDynamicShortcutInput = `m-$' + '{number}`')
	expect(contribution?.declarations)
		.toContain('Button docs')
	expect(diagnostics)
		.toEqual(expect.arrayContaining([
			expect.objectContaining({ code: 'shortcut-autocomplete-pattern-mismatch' }),
		]))
})

it('renders resolved previews for static shortcuts by default and keeps descriptions additive', async () => {
	const engine = await createEngine({
		shortcuts: {
			definitions: [
				{ name: 'base', value: { display: 'grid', gap: '1rem' } },
				{ name: 'card', value: ['base', { color: 'red' }], description: 'Card docs' },
			],
		},
	})

	expect(engine.store.atomicStyles.size)
		.toBe(0)
	const declarations = engine.typegen.snapshot.contributions.find(({ id }) => id === 'core:shortcuts')!.declarations!
	const baseStart = declarations.indexOf('/**', declarations.indexOf('interface __PikaExplicitShortcuts'))
	const baseEnd = declarations.indexOf('"base": string')
	const baseDocs = declarations.slice(baseStart, baseEnd)
	expect(baseDocs)
		.toContain('### PikaCSS Preview')
	expect(baseDocs)
		.toContain('@layer utilities {')
	expect(baseDocs)
		.toContain('display: grid;')
	expect(baseDocs)
		.toContain('gap: 1rem;')

	const cardMember = declarations.indexOf('"card": string')
	const cardDocsStart = declarations.lastIndexOf('/**', cardMember)
	const cardDocs = declarations.slice(cardDocsStart, cardMember)
	expect(cardDocs)
		.toContain('Card docs')
	expect(cardDocs)
		.toContain('### PikaCSS Preview')
	expect(cardDocs.indexOf('Card docs'))
		.toBeLessThan(cardDocs.indexOf('### PikaCSS Preview'))
	expect(cardDocs)
		.toContain('display: grid;')
	expect(cardDocs)
		.toContain('color: red;')
})

it('finalizes rich concrete previews without committing ids or seeding runtime shortcut caches', async () => {
	let previewCalls = 0
	let runtimeCalls = 0
	const engine = await createEngine({
		shortcuts: {
			definitions: [
				{ name: 'base', value: { display: 'block' } },
				{
					pattern: /^icon-(\w+)$/,
					inputType: '`icon-$' + '{string}`',
					autocomplete: ['icon-home'],
					description: 'Icon docs',
					resolve: (matched, context) => {
						if (context?.preview != null) {
							previewCalls++
							context.preview.image({
								content: `<svg data-icon="${matched[1]}" />`,
								mediaType: 'image/svg+xml',
								alt: `${matched[1]} icon`,
							})
						}
						else {
							runtimeCalls++
						}
						return ['base', { color: 'red' }]
					},
				},
			],
		},
	})

	expect(previewCalls)
		.toBe(1)
	expect(runtimeCalls)
		.toBe(0)
	expect(engine.store.atomicStyles.size)
		.toBe(0)
	expect(engine.typegen.snapshot.previewAssets)
		.toEqual([expect.objectContaining({
			content: '<svg data-icon="home" />',
			mediaType: 'image/svg+xml',
		})])
	const shortcutContribution = engine.typegen.snapshot.contributions.find(({ id }) => id === 'core:shortcuts')!
	expect(shortcutContribution.declarations)
		.toContain('Icon docs')
	expect(shortcutContribution.declarations)
		.toContain('.pika-preview')
	expect(shortcutContribution.declarations)
		.toContain('display: block;')
	expect(shortcutContribution.declarations)
		.toContain('color: red;')
	expect(shortcutContribution.declarations)
		.not.toContain('file:///preview.svg')
	const iconMember = shortcutContribution.declarations!.indexOf('\"icon-home\": string')
	const iconDocs = shortcutContribution.declarations!.slice(shortcutContribution.declarations!.lastIndexOf('/**', iconMember), iconMember)
	expect(iconDocs.indexOf('Icon docs'))
		.toBeLessThan(iconDocs.indexOf('### PikaCSS Preview'))

	const rendered = renderTypegenDocument([{
		fnName: 'pika',
		publicModule: '@pikacss/core',
		transformedFormat: 'string',
		snapshot: engine.typegen.snapshot,
		hostBindings: {
			resolvePreviewImageHref: () => 'file:///preview.svg',
		},
	}])
	expect(rendered)
		.toContain('![home icon](file:///preview.svg)')

	await engine.use('icon-home')
	await engine.use('icon-home')
	expect(runtimeCalls)
		.toBe(1)
	expect(engine.store.atomicStyles.size)
		.toBeGreaterThan(0)
})

it('keeps concrete members when preview resolution throws and diagnoses the documentation failure', async () => {
	const diagnostics: Array<{ code: string }> = []
	const engine = await createEngine({
		shortcuts: {
			definitions: [{
				pattern: /^demo-(\w+)$/,
				inputType: '`demo-$' + '{string}`',
				autocomplete: ['demo-ok'],
				resolve: (_matched, context) => {
					if (context?.preview != null)
						throw new Error('preview exploded')
					return { color: 'red' }
				},
			}],
		},
	}, { onDiagnostic: diagnostic => diagnostics.push(diagnostic) })

	const declarations = engine.typegen.snapshot.contributions.find(({ id }) => id === 'core:shortcuts')!.declarations!
	expect(declarations)
		.toContain('"demo-ok": string')
	expect(engine.typegen.snapshot.previewAssets)
		.toEqual([])
	expect(diagnostics)
		.toContainEqual(expect.objectContaining({ code: 'shortcut-preview-resolution-error' }))
})

it('sees concrete dynamic members appended by a later plugin configureEngine hook', async () => {
	const concrete: string[] = []
	const producer = defineEnginePlugin({
		name: 'test:late-shortcut-corpus',
		configureRawConfig(config) {
			config.shortcuts = {
				definitions: [
					...(config.shortcuts?.definitions ?? []),
					{
						pattern: /^late-(\w+)$/,
						inputType: '`late-$' + '{string}`',
						autocomplete: concrete,
						resolve: matched => ({ color: matched[1] }),
					},
				],
			}
		},
		configureEngine() {
			concrete.push('late-red')
		},
	})
	const engine = await createEngine({ plugins: [producer] })
	const declarations = engine.typegen.snapshot.contributions.find(({ id }) => id === 'core:shortcuts')!.declarations!

	expect(declarations)
		.toContain('"late-red": string')
	expect(declarations)
		.toContain('color: red;')
})

it('keeps preview finalization side-effect isolated across cycles, unmatched redirects, nullish results, and string-thrown failures', async () => {
	const diagnostics: Array<{ code: string, message: string }> = []
	const engine = await createEngine({
		shortcuts: {
			definitions: [
				{ name: 'cycle-base', value: 'cycle-demo' },
				{
					pattern: /^cycle-(\w+)$/,
					inputType: '`cycle-$' + '{string}`',
					autocomplete: ['cycle-demo'],
					resolve: () => 'cycle-base',
				},
				{
					pattern: /^raw-(\w+)$/,
					inputType: '`raw-$' + '{string}`',
					autocomplete: ['raw-demo'],
					resolve: () => 'no-rule-here',
				},
				{
					pattern: /^null-(\w+)$/,
					inputType: '`null-$' + '{string}`',
					autocomplete: ['null-demo'],
					resolve: () => undefined,
				},
				{
					pattern: /^boom-(\w+)$/,
					inputType: '`boom-$' + '{string}`',
					autocomplete: ['boom-demo'],
					resolve: (_match, context) => {
						if (context?.preview != null)
							throw new PreviewFailure()
						return { color: 'red' }
					},
				},
				{
					pattern: /^open-(\w+)$/,
					inputType: '`open-$' + '{string}`',
					resolve: match => ({ color: match[1] }),
				},
				['legacy', { color: 'red' }] as any,
			],
		},
	}, { onDiagnostic: diagnostic => diagnostics.push(diagnostic) })

	const declarations = engine.typegen.snapshot.contributions.find(({ id }) => id === 'core:shortcuts')!.declarations!
	for (const member of ['cycle-demo', 'raw-demo', 'null-demo', 'boom-demo']) {
		expect(declarations)
			.toContain(`"${member}": string`)
	}
	expect(declarations).not.toContain('no-rule-here')
	expect(diagnostics)
		.toContainEqual(expect.objectContaining({
			code: 'shortcut-preview-resolution-error',
			message: expect.stringContaining('string boom'),
		}))
})

it('renders no-alt preview images plus nested and layered preview CSS without committing styles', async () => {
	const engine = await createEngine({
		layers: { demo: 5 },
		shortcuts: {
			definitions: [{
				pattern: /^rich$/,
				inputType: '"rich"',
				autocomplete: ['rich'],
				resolve: (_match, context) => {
					context?.preview?.image({ content: '<svg/>', mediaType: 'image/svg+xml' })
					return [
						{ ':hover': { color: 'red' } },
						{ __layer: 'demo', backgroundColor: 'blue' },
					]
				},
			}],
		},
	})

	expect(engine.store.atomicStyles.size)
		.toBe(0)
	expect(engine.typegen.snapshot.previewAssets)
		.toEqual([
			expect.objectContaining({ content: '<svg/>', mediaType: 'image/svg+xml' }),
		])
	const declarations = engine.typegen.snapshot.contributions.find(({ id }) => id === 'core:shortcuts')!.declarations!
	expect(declarations)
		.toContain(':hover')
	expect(declarations)
		.toContain('@layer demo')
	expect(declarations)
		.toContain('background-color: blue;')
})

it('runs downstream style-item transforms for unresolved strings while building shortcut previews', async () => {
	const downstream = defineEnginePlugin({
		name: 'test:shortcut-preview-downstream',
		transformStyleItems(items) {
			return items.map(item => item === 'external-token' ? { color: 'rebeccapurple' } : item)
		},
	})
	const engine = await createEngine({
		shortcuts: {
			definitions: [{ name: 'bridge', value: 'external-token' }],
		},
		plugins: [downstream],
	})
	const declarations = engine.typegen.snapshot.contributions.find(({ id }) => id === 'core:shortcuts')!.declarations!
	const member = declarations.indexOf('"bridge": string')
	const docs = declarations.slice(declarations.lastIndexOf('/**', member), member)

	expect(docs)
		.toContain('color: rebeccapurple;')
	const ids = await engine.use('bridge')
	const css = await engine.renderAtomicStyles(false, { atomicStyleIds: ids })
	expect(css)
		.toContain('color:rebeccapurple;')
})

it('propagates preview shortcut context through nested style-item arrays without seeding runtime caches', async () => {
	let previewInnerCalls = 0
	let runtimeInnerCalls = 0
	const engine = await createEngine({
		shortcuts: {
			definitions: [
				{ name: 'outer', value: { ':hover': ['inner-demo'] } },
				{
					pattern: /^inner-demo$/,
					inputType: '"inner-demo"',
					resolve: (_match, context) => {
						if (context?.preview != null)
							previewInnerCalls++
						else
							runtimeInnerCalls++
						return { color: 'red' }
					},
				},
			],
		},
	})
	const declarations = engine.typegen.snapshot.contributions.find(({ id }) => id === 'core:shortcuts')!.declarations!
	const member = declarations.indexOf('"outer": string')
	const docs = declarations.slice(declarations.lastIndexOf('/**', member), member)

	expect(previewInnerCalls)
		.toBe(1)
	expect(runtimeInnerCalls)
		.toBe(0)
	expect(docs)
		.toContain(':hover')
	expect(docs)
		.toContain('color: red;')
	expect(engine.store.atomicStyles.size)
		.toBe(0)

	await engine.use('outer')
	await engine.use('outer')
	expect(runtimeInnerCalls)
		.toBe(1)
})

it('falls back to unlayered shortcut preview CSS for unknown layers like runtime rendering', async () => {
	const diagnostics: Array<{ code: string }> = []
	const engine = await createEngine({
		shortcuts: {
			definitions: [{ name: 'bad-layer', value: { __layer: 'missing', color: 'red' } }],
		},
	}, { onDiagnostic: diagnostic => diagnostics.push(diagnostic) })
	const declarations = engine.typegen.snapshot.contributions.find(({ id }) => id === 'core:shortcuts')!.declarations!
	const member = declarations.indexOf('"bad-layer": string')
	const docs = declarations.slice(declarations.lastIndexOf('/**', member), member)

	expect(docs)
		.toContain('color: red;')
	expect(docs).not.toContain('@layer missing')
	expect(docs).not.toContain('@layer utilities')
	expect(diagnostics)
		.toContainEqual(expect.objectContaining({ code: 'atomic-style-unknown-layer' }))

	const ids = await engine.use('bad-layer')
	const css = await engine.renderAtomicStyles(false, { atomicStyleIds: ids })
	expect(css)
		.toContain('color:red;')
	expect(css).not.toContain('@layer missing')
	expect(css).not.toContain('@layer utilities')
})

it('rolls back preview images and assets for a failing member while keeping healthy members', async () => {
	const diagnostics: Array<{ code: string }> = []
	const engine = await createEngine({
		shortcuts: {
			definitions: [{
				pattern: /^(ok|bad)$/,
				inputType: '"ok" | "bad"',
				autocomplete: ['ok', 'bad'],
				resolve: (matched, context) => {
					context?.preview?.image({
						content: `<svg data-kind="${matched[1]}"/>`,
						mediaType: 'image/svg+xml',
						alt: `${matched[1]} icon`,
					})
					if (matched[1] === 'bad' && context?.preview != null)
						throw new Error('bad preview after image')
					return { color: matched[1] === 'ok' ? 'green' : 'red' }
				},
			}],
		},
	}, { onDiagnostic: diagnostic => diagnostics.push(diagnostic) })

	expect(engine.typegen.snapshot.previewAssets)
		.toHaveLength(1)
	expect(engine.typegen.snapshot.previewAssets[0]?.content)
		.toBe('<svg data-kind="ok"/>')
	const declarations = engine.typegen.snapshot.contributions.find(({ id }) => id === 'core:shortcuts')!.declarations!
	for (const name of ['ok', 'bad']) {
		expect(declarations)
			.toContain(`"${name}": string`)
	}
	const okMember = declarations.indexOf('"ok": string')
	const okDocs = declarations.slice(declarations.lastIndexOf('/**', okMember), okMember)
	expect(okDocs)
		.toContain('color: green;')
	const badMember = declarations.indexOf('"bad": string')
	const badDocs = declarations.slice(declarations.lastIndexOf('/**', badMember), badMember)
	expect(badDocs).not.toContain('### PikaCSS Preview')
	expect(badDocs).not.toContain('bad icon')
	expect(diagnostics)
		.toContainEqual(expect.objectContaining({ code: 'shortcut-preview-resolution-error' }))
})

it('freezes finalized shortcut declaration semantics against later raw-config mutation', async () => {
	const engine = await createEngine({
		shortcuts: {
			definitions: [
				{ name: 'card', value: { color: 'red' }, description: 'Stable card' },
				{
					pattern: /^space-(\d+)$/,
					inputType: '`space-$' + '{number}`',
					autocomplete: ['space-2'],
					resolve: matched => ({ margin: `${matched[1]}px` }),
				},
			],
		},
	})
	const render = () => renderTypegenDocument([{
		fnName: 'pika',
		publicModule: '@pikacss/core',
		transformedFormat: 'string',
		snapshot: engine.typegen.snapshot,
	}])
	const before = render()
	const definitions = engine.config.rawConfig.shortcuts!.definitions
	;(definitions[0] as any).name = 'mutated-card'
	;(definitions[0] as any).description = 'Mutated docs'
	;(definitions[1] as any).inputType = '"mutated"'
	;(definitions[1] as any).autocomplete.push('space-99')

	expect(render())
		.toBe(before)
})

it('uses static shortcut precedence for both preview semantics and description', async () => {
	const engine = await createEngine({
		shortcuts: {
			definitions: [
				{
					pattern: /^same$/,
					inputType: '"same"',
					autocomplete: ['same'],
					resolve: () => ({ color: 'blue' }),
					description: 'Dynamic docs',
				},
				{ name: 'same', value: { color: 'red' }, description: 'Static docs' },
			],
		},
	})
	const declarations = engine.typegen.snapshot.contributions.find(({ id }) => id === 'core:shortcuts')!.declarations!
	const member = declarations.indexOf('"same": string')
	const docs = declarations.slice(declarations.lastIndexOf('/**', member), member)

	expect(docs)
		.toContain('Static docs')
	expect(docs).not.toContain('Dynamic docs')
	expect(docs)
		.toContain('color: red;')
	expect(docs).not.toContain('color: blue;')
})

it('drops preview CSS when downstream content transforms remove the atomic placeholder', async () => {
	const downstream = defineEnginePlugin({
		name: 'test:preview-placeholder-removal',
		transformStyleContents(contents) {
			return contents.map(content => ({ ...content, selector: ['.global-only'] }))
		},
	})
	const engine = await createEngine({
		shortcuts: { definitions: [{ name: 'card', value: { color: 'red' }, description: 'Card docs' }] },
		plugins: [downstream],
	})
	const declarations = engine.typegen.snapshot.contributions.find(({ id }) => id === 'core:shortcuts')!.declarations!
	const member = declarations.indexOf('"card": string')
	const docs = declarations.slice(declarations.lastIndexOf('/**', member), member)

	expect(docs)
		.toContain('Card docs')
	expect(docs).not.toContain('### PikaCSS Preview')
	const ids = await engine.use('card')
	const css = await engine.renderAtomicStyles(false, { atomicStyleIds: ids })
	expect(css).not.toContain('color:red')
})

it('isolates resolved shortcut style payloads from preview-only downstream mutation', async () => {
	const downstream = defineEnginePlugin({
		name: 'test:preview-style-payload-isolation',
		transformStyleItems(items) {
			for (const item of items) {
				if (typeof item === 'object' && item != null) {
					;(item as any).color = 'blue'
				}
			}
			return items
		},
	})
	const engine = await createEngine({
		shortcuts: { definitions: [{ name: 'card', value: { color: 'red' } }] },
		plugins: [downstream],
	})
	const definition = engine.config.rawConfig.shortcuts!.definitions[0] as any
	const declarations = engine.typegen.snapshot.contributions.find(({ id }) => id === 'core:shortcuts')!.declarations!
	const member = declarations.indexOf('"card": string')
	const docs = declarations.slice(declarations.lastIndexOf('/**', member), member)

	expect(docs)
		.toContain('color: blue;')
	expect(definition.value.color)
		.toBe('red')
})

it('isolates stateful downstream preview hooks from runtime plugin state', async () => {
	const downstream = defineEnginePlugin({
		name: 'test:preview-state-isolation',
		createState: () => {
			const cycle: { self?: unknown } = {}
			cycle.self = cycle
			const nullRecord = Object.assign(Object.create(null) as Record<string, number>, { value: 1 })
			const createdAt = new Date(0)
			const pattern = /preview/g
			return {
				transforms: 0,
				nested: { transforms: 0 },
				items: ['preview'],
				cycle,
				nullRecord,
				seen: new Set<string>(),
				counts: new Map<string, number>(),
				createdAt,
				createdAtAlias: createdAt,
				pattern,
				patternAlias: pattern,
			}
		},
		configureEngine(configurator) {
			;(configurator.runtime as any).__previewStateIsolation = configurator.state
		},
		transformStyleDefinitions(definitions, context) {
			expect(context.state.cycle.self)
				.toBe(context.state.cycle)
			expect(Object.getPrototypeOf(context.state.nullRecord))
				.toBeNull()
			expect(context.state.createdAtAlias)
				.toBe(context.state.createdAt)
			expect(context.state.patternAlias)
				.toBe(context.state.pattern)
			context.state.transforms++
			context.state.nested.transforms++
			context.state.seen.add('preview-or-runtime')
			context.state.counts.set('calls', context.state.transforms)
			context.state.pattern.lastIndex = 3
			return definitions
		},
	})
	const engine = await createEngine({
		shortcuts: { definitions: [{ name: 'card', value: { color: 'red' } }] },
		plugins: [downstream],
	})
	const runtimeState = (engine as any).__previewStateIsolation
	const declarations = engine.typegen.snapshot.contributions.find(({ id }) => id === 'core:shortcuts')!.declarations!

	expect(declarations)
		.toContain('color: red;')
	expect(runtimeState)
		.toMatchObject({ transforms: 0, nested: { transforms: 0 } })
	expect(runtimeState.seen.size)
		.toBe(0)
	expect(runtimeState.counts.size)
		.toBe(0)
	expect(runtimeState.pattern.lastIndex)
		.toBe(0)

	await engine.use('card')
	expect(runtimeState)
		.toMatchObject({ transforms: 1, nested: { transforms: 1 } })
	expect(runtimeState.seen.has('preview-or-runtime'))
		.toBe(true)
	expect(runtimeState.counts.get('calls'))
		.toBe(1)
	expect(runtimeState.pattern.lastIndex)
		.toBe(3)
})

it('degrades preview generation instead of sharing unsafe plugin state', async () => {
	class OpaquePreviewState {}
	const unsafeStates: Array<[string, () => object]> = [
		['function', () => ({ helper: () => 'runtime-only' })],
		['opaque', () => ({ helper: new OpaquePreviewState() })],
		['accessor', () => {
			const state = {}
			Object.defineProperty(state, 'helper', { get: () => 'runtime-only', enumerable: true })
			return state
		}],
	]

	for (const [name, createState] of unsafeStates) {
		const diagnostics: Array<{ code: string, message: string }> = []
		const downstream = defineEnginePlugin({
			name: `test:unsafe-preview-state-${name}`,
			createState,
			configureEngine(configurator) {
				void configurator.state
			},
			transformStyleDefinitions(definitions) {
				return definitions
			},
		})
		const engine = await createEngine({
			shortcuts: { definitions: [{ name: 'card', value: { color: 'red' }, description: 'Card docs' }] },
			plugins: [downstream],
		}, { onDiagnostic: diagnostic => diagnostics.push(diagnostic) })
		const declarations = engine.typegen.snapshot.contributions.find(({ id }) => id === 'core:shortcuts')!.declarations!
		const member = declarations.indexOf('"card": string')
		const docs = declarations.slice(declarations.lastIndexOf('/**', member), member)

		expect(declarations)
			.toContain('"card": string')
		expect(docs)
			.toContain('Card docs')
		expect(docs).not.toContain('### PikaCSS Preview')
		expect(diagnostics)
			.toContainEqual(expect.objectContaining({
				code: 'shortcut-preview-resolution-error',
				message: expect.stringContaining('cannot be isolated safely'),
			}))
	}
})

it('preserves an empty layer marker in shortcut previews like runtime rendering', async () => {
	const engine = await createEngine({
		shortcuts: { definitions: [{ name: 'empty-layer', value: { __layer: '', color: 'red' } }] },
	})
	const declarations = engine.typegen.snapshot.contributions.find(({ id }) => id === 'core:shortcuts')!.declarations!
	const member = declarations.indexOf('"empty-layer": string')
	const docs = declarations.slice(declarations.lastIndexOf('/**', member), member)
	const ids = await engine.use('empty-layer')
	const css = await engine.renderAtomicStyles(false, { atomicStyleIds: ids })

	expect(docs)
		.toContain('@layer utilities {')
	expect(docs)
		.toContain('@layer  {')
	expect(css)
		.toContain('@layer utilities {')
	expect(css)
		.toContain('@layer {')
})
