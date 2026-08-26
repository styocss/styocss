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
