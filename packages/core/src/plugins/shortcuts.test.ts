import { describe, expect, it } from 'vitest'

import { createEngine } from '../engine'
import { resolveShortcutConfig } from './shortcuts'

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
