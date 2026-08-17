import { describe, expect, it } from 'vitest'
import { createDeferred } from '../../_shared/vitest'
import { getDiagnosticScope, runWithDiagnosticScope } from './diagnosticScope'

describe('diagnosticScope', () => {
	it('returns an empty scope outside any run', () => {
		expect(getDiagnosticScope())
			.toEqual({})
	})

	it('merges nested scopes and restores the outer scope afterwards', () => {
		runWithDiagnosticScope({ generationId: 7 }, () => {
			expect(getDiagnosticScope())
				.toEqual({ generationId: 7 })
			runWithDiagnosticScope({ moduleId: '/src/a.ts' }, () => {
				expect(getDiagnosticScope())
					.toEqual({ generationId: 7, moduleId: '/src/a.ts' })
			})
			expect(getDiagnosticScope())
				.toEqual({ generationId: 7 })
		})
		expect(getDiagnosticScope())
			.toEqual({})
	})

	it('keeps each concurrent async chain in its own scope across await boundaries', async () => {
		const gateA = createDeferred()
		const gateB = createDeferred()
		const seen: Record<string, string | undefined> = {}

		const taskA = runWithDiagnosticScope({ moduleId: '/src/a.ts' }, async () => {
			await gateA.promise
			seen.a = getDiagnosticScope().moduleId
		})
		const taskB = runWithDiagnosticScope({ moduleId: '/src/b.ts' }, async () => {
			await gateB.promise
			seen.b = getDiagnosticScope().moduleId
		})

		// Resume B first, then A: attribution must not leak across chains.
		gateB.resolve()
		await taskB
		gateA.resolve()
		await taskA

		expect(seen)
			.toEqual({ a: '/src/a.ts', b: '/src/b.ts' })
	})
})
