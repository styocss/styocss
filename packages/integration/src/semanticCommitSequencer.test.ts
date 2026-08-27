import { describe, expect, it, vi } from 'vitest'
import { createSemanticCommitSequencer } from './semanticCommitSequencer'

describe('semantic commit sequencer (#149)', () => {
	it('runs ready commits in allocation order rather than readiness order', async () => {
		const sequencer = createSemanticCommitSequencer()
		const first = sequencer.allocate()
		const second = sequencer.allocate()
		const order: string[] = []
		const secondResult = second.commit(() => {
			order.push('second')
			return 2
		})

		// The second decision is already ready, but cannot pass its predecessor,
		// whose decision has not been supplied yet.
		await Promise.resolve()
		expect(order)
			.toEqual([])
		const firstResult = first.commit(() => {
			order.push('first')
			return 1
		})
		expect(await Promise.all([firstResult, secondResult]))
			.toEqual([1, 2])
		expect(order)
			.toEqual(['first', 'second'])
	})

	it('rejects commit immediately after a slot was cancelled before becoming ready', async () => {
		const sequencer = createSemanticCommitSequencer()
		const slot = sequencer.allocate()
		const reason = new Error('superseded')
		slot.cancel(reason)

		expect(slot.cancelled)
			.toBe(true)
		await expect(slot.commit(() => 1))
			.rejects.toBe(reason)
		// Repeated cancellation after terminalization is inert.
		slot.cancel(new Error('ignored'))
	})

	it('rejects a duplicate commit decision for the same slot', async () => {
		const sequencer = createSemanticCommitSequencer()
		const blocker = sequencer.allocate()
		const slot = sequencer.allocate()
		const first = slot.commit(() => 1)

		await expect(slot.commit(() => 2))
			.rejects.toThrow('already settled')
		blocker.cancel()
		expect(await first)
			.toBe(1)
	})

	it('can cancel a ready commit while it is still waiting for its predecessor', async () => {
		const sequencer = createSemanticCommitSequencer()
		const blocker = sequencer.allocate()
		const slot = sequencer.allocate()
		const run = vi.fn(() => 1)
		const pending = slot.commit(run)
		const reason = new Error('stale after prepare')

		slot.cancel(reason)
		blocker.cancel()
		await expect(pending)
			.rejects.toBe(reason)
		expect(run)
			.not.toHaveBeenCalled()
	})

	it('allows later slots to advance after a commit callback throws', async () => {
		const sequencer = createSemanticCommitSequencer()
		const failed = sequencer.allocate()
		const later = sequencer.allocate()
		const failure = failed.commit(() => {
			throw new Error('commit exploded')
		})
		const success = later.commit(() => 'ok')

		await expect(failure)
			.rejects.toThrow('commit exploded')
		expect(await success)
			.toBe('ok')
	})
})
