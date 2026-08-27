import { describe, expect, it } from 'vitest'

import { createEngine } from '../engine'

describe('keyframes plugin', () => {
	it('uses object-only local definitions and preserves usage-scoped pruning', async () => {
		const engine = await createEngine({
			keyframes: {
				definitions: [
					{ name: 'fade', frames: { from: { opacity: '0' }, to: { opacity: '1' } }, animationValues: ['fade 1s ease-in'] },
					{ name: 'spin', frames: { from: { rotate: '0deg' }, to: { rotate: '360deg' } } },
				],
			},
		})

		const spinIds = await engine.use({ animationName: 'spin' })
		await engine.use({ animation: 'fade 1s ease-in' })
		const scoped = await engine.renderPreflights(false, { usedAtomicStyleIds: spinIds })
		expect(scoped)
			.toContain('@keyframes spin')
		expect(scoped)
			.not.toContain('@keyframes fade')
		const full = await engine.renderPreflights(false)
		expect(full)
			.toContain('@keyframes fade')
	})

	it('keeps local keyframes when pruning is disabled globally and never emits external definitions', async () => {
		const engine = await createEngine({
			keyframes: {
				pruneUnused: false,
				definitions: [
					{ name: 'pulse', frames: { '50%': { opacity: '0.5' } } },
					{ external: 'external-spin', animationValues: ['external-spin 2s linear'] },
					{ external: 'plain-external' },
				],
			},
		})

		const css = await engine.renderPreflights(false)
		expect(css)
			.toContain('@keyframes pulse{50%{opacity:0.5;}}')
		expect(css)
			.not.toContain('external-spin')
	})

	it('owns pika.kf and setup-derived animation value Typegen with rich local docs', async () => {
		const engine = await createEngine({
			keyframes: {
				definitions: [
					{
						name: 'fade',
						frames: { from: { opacity: '0' }, to: { opacity: '1' } },
						animationValues: ['fade 200ms ease-out'],
						description: 'Fade docs',
					},
					{ external: 'spin', animationValues: ['spin 1s linear'], description: 'External spin' },
				],
			},
		})

		expect(engine.pika.getStatic('kf'))
			.toEqual({ fade: 'fade', spin: 'spin' })
		const contribution = engine.typegen.snapshot.contributions.find(({ id }) => id === 'core:keyframes')
		expect(contribution?.pika)
			.toEqual({ kf: '__PikaKeyframes' })
		expect(contribution?.cssPropertyValues)
			.toBe('__PikaKeyframePropertyValues')
		expect(contribution?.declarations)
			.toContain('"fade": "fade"')
		expect(contribution?.declarations)
			.toContain('animationName: "fade" | "spin"')
		expect(contribution?.declarations)
			.toContain('animation: "fade" | "fade 200ms ease-out" | "spin" | "spin 1s linear"')
		expect(contribution?.declarations)
			.toContain('Fade docs')
		expect(contribution?.declarations)
			.toContain('@keyframes fade')
	})

	it('rejects legacy keyframe authoring forms at the type boundary', () => {
		const assertConfig = (_config: Parameters<typeof createEngine>[0]) => {}
		// @ts-expect-error string shorthand is removed
		assertConfig({ keyframes: { definitions: ['spin'] } })
		// @ts-expect-error tuple shorthand is removed
		assertConfig({ keyframes: { definitions: [['spin', { from: { opacity: '0' } }]] } })
		// @ts-expect-error local keyframes require frames
		assertConfig({ keyframes: { definitions: [{ name: 'spin' }] } })
		// @ts-expect-error external definitions cannot carry local-only pruneUnused
		assertConfig({ keyframes: { definitions: [{ external: 'spin', pruneUnused: false }] } })
	})
})

it('ignores malformed runtime definitions consistently and renders fallback values in preview docs', async () => {
	const engine = await createEngine({
		keyframes: {
			definitions: [
				{ external: '   ' } as any,
				{ name: '   ', frames: { from: { opacity: '0' } } } as any,
				{ name: 'empty-preview', frames: { from: { opacity: undefined as any } } },
				{ name: 'missing-frames' } as any,
				{
					name: 'fallbacks',
					frames: {
						from: { display: ['grid', ['-ms-grid']] as any },
					},
				},
			],
		},
	})

	expect(engine.pika.getStatic('kf'))
		.toEqual({ 'empty-preview': 'empty-preview', 'fallbacks': 'fallbacks' })
	const contribution = engine.typegen.snapshot.contributions.find(({ id }) => id === 'core:keyframes')
	expect(contribution?.declarations)
		.toContain('display: -ms-grid;')
	expect(contribution?.declarations)
		.toContain('display: grid;')
})
