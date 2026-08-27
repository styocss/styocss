/**
 * One generation-local semantic commit slot.
 *
 * A slot is allocated synchronously in host encounter order. Async analysis /
 * prepare may finish in any order, but the synchronous commit callback runs
 * only after every earlier slot has reached a terminal commit/cancel decision.
 * A later revision may cancel an older slot before its prepare finishes,
 * releasing following work without waiting for obsolete async computation.
 */
export interface SemanticCommitSlot {
	readonly sequence: number
	readonly cancelled: boolean
	commit: <T>(commit: () => T) => Promise<T>
	cancel: (reason?: unknown) => void
}

/** Generation-local deterministic semantic commit sequencer. */
export interface SemanticCommitSequencer {
	allocate: () => SemanticCommitSlot
}

type CommitDecision
	= | { readonly type: 'cancel' }
		| {
			readonly type: 'commit'
			readonly run: () => unknown
			readonly resolve: (value: unknown) => void
			readonly reject: (reason: unknown) => void
		}

const DEFAULT_CANCEL_REASON = new Error('Semantic commit slot was cancelled')

/**
 * Creates one deterministic sequencer for exactly one semantic generation.
 * @internal
 */
export function createSemanticCommitSequencer(): SemanticCommitSequencer {
	let nextSequence = 0
	let previous = Promise.resolve()

	return {
		allocate(): SemanticCommitSlot {
			const sequence = nextSequence++
			const predecessor = previous
			let resolveDecision!: (decision: CommitDecision) => void
			const decision = new Promise<CommitDecision>((resolve) => {
				resolveDecision = resolve
			})
			let decided = false
			let finished = false
			let cancelled = false
			let cancelReason: unknown = DEFAULT_CANCEL_REASON

			const completed = predecessor.then(async () => {
				const pending = await decision
				if (pending.type === 'cancel') {
					finished = true
					return
				}

				if (cancelled) {
					finished = true
					pending.reject(cancelReason)
					return
				}

				try {
					// No await is permitted inside this critical section: Engine commit
					// mutation and contribution replacement are one synchronous turn.
					pending.resolve(pending.run())
				}
				catch (error) {
					pending.reject(error)
				}
				finally {
					finished = true
				}
			})

			// A commit callback failure rejects only its caller. Later slots still
			// advance once this slot's synchronous terminal section has completed.
			previous = completed.catch(() => {})

			return {
				sequence,
				get cancelled() { return cancelled },
				commit<T>(commit: () => T): Promise<T> {
					if (cancelled)
						return Promise.reject(cancelReason)
					if (decided)
						return Promise.reject(new Error(`Semantic commit slot ${sequence} is already settled`))
					decided = true
					return new Promise<T>((resolve, reject) => {
						resolveDecision({
							type: 'commit',
							run: commit,
							resolve: value => resolve(value as T),
							reject,
						})
					})
				},
				cancel(reason: unknown = DEFAULT_CANCEL_REASON): void {
					if (finished || cancelled)
						return
					cancelled = true
					cancelReason = reason
					if (!decided) {
						decided = true
						resolveDecision({ type: 'cancel' })
					}
				},
			}
		},
	}
}
