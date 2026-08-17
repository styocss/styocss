/**
 * #116 — one `designTokens()` definition is reusable across sequential and
 * concurrent engines: token metadata, strict state, and violation counters are
 * engine-local (`context.state`), never shared through the definition.
 */
import { createEngine, defineEnginePlugin } from '@pikacss/core'
import { describe, expect, it } from 'vitest'
import { createDeferred } from '../../_shared/vitest'
import { designTokens } from './index'

const TOKENS_A = { color: { primary: { $value: '#a00' }, legacy: { $value: '#0a0', $deprecated: true } } }
const TOKENS_B = { size: { large: { $value: '2rem' } } }

describe('plugin definition reuse (#116)', () => {
	it('keeps token metadata and report() engine-local across sequential engines', async () => {
		const plugin = designTokens()

		const a = await createEngine({
			plugins: [plugin],
			designTokens: { pruneUnused: false, sources: TOKENS_A },
		})
		const b = await createEngine({
			plugins: [plugin],
			designTokens: { pruneUnused: false, sources: TOKENS_B },
		})

		const reportA = a.designTokens!.report()
		const reportB = b.designTokens!.report()
		const namesA = reportA.unused
		const namesB = reportB.unused

		expect(namesA.some(name => name.includes('color-primary')))
			.toBe(true)
		expect(namesA.some(name => name.includes('size-large')))
			.toBe(false)
		// B, created later with the same definition, sees only its own tokens —
		// A's report closure keeps answering with A's state.
		expect(namesB.some(name => name.includes('size-large')))
			.toBe(true)
		expect(namesB.some(name => name.includes('color-primary')))
			.toBe(false)
	})

	it('keeps strict violation counters per engine', async () => {
		const plugin = designTokens()
		const strictConfig = {
			pruneUnused: false,
			sources: TOKENS_A,
			strict: { level: 'warn' as const, checks: { deprecated: 'warn' as const } },
		}

		const a = await createEngine({ plugins: [plugin], designTokens: strictConfig })
		const b = await createEngine({ plugins: [plugin], designTokens: strictConfig })

		// Only A observes a deprecated-token usage.
		await a.use({ color: 'var(--color-legacy)' })

		expect(a.designTokens!.report().strictViolations.warning)
			.toBeGreaterThan(0)
		// The counters are per-engine state: B's report stays clean instead of
		// accumulating A's violations through a shared definition closure.
		expect(b.designTokens!.report().strictViolations.warning)
			.toBe(0)
	})

	it('isolates state when engine creations interleave', async () => {
		const plugin = designTokens()
		const holdA = createDeferred()
		const releaseB = createDeferred()
		// Registered after design-tokens (which is order: 'pre'): suspends
		// engine A between design-tokens' configureRawConfig and the rest of
		// A's creation while B runs to completion with the same definition.
		const gate = defineEnginePlugin({
			name: 'test:gate',
			configureRawConfig: async (config: any) => {
				if (config.__gate === 'a') {
					releaseB.resolve()
					await holdA.promise
				}
			},
		})

		const creatingA = createEngine({
			plugins: [plugin, gate],
			designTokens: { pruneUnused: false, sources: TOKENS_A },
			__gate: 'a',
		} as any)
		await releaseB.promise
		const b = await createEngine({
			plugins: [plugin, gate],
			designTokens: { pruneUnused: false, sources: TOKENS_B },
		} as any)
		holdA.resolve()
		const a = await creatingA

		expect(await a.renderPreflights(false))
			.toContain('--color-primary:#a00')
		expect(await a.renderPreflights(false))
			.not.toContain('--size-large')
		expect(await b.renderPreflights(false))
			.toContain('--size-large:2rem')
		expect(a.designTokens!.report().unused.some(name => name.includes('size-large')))
			.toBe(false)
	})
})
