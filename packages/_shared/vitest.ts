import type { ViteUserConfigExport } from 'vitest/config'

export function createPackageVitestConfig(): ViteUserConfigExport {
	return {
		test: {
			coverage: {
				enabled: true,
				provider: 'v8',
				thresholds: {
					branches: 95,
					functions: 95,
					lines: 95,
					statements: 95,
				},
				include: [
					'src/**/*.{ts,tsx}',
				],
				exclude: [
					'**/*.config.*',
					'**/*.gen.*',
					'**/docs/**',
					'**/scripts/**',
					'**/dist/**',
					'**/coverage/**',
					'**/src/generated/*.ts',
					'**/*.bench.*',
				],
				reportsDirectory: './coverage',
			},
		},
	}
}

export function createDeferred<T = void>() {
	let resolve!: (value: T | PromiseLike<T>) => void
	const promise = new Promise<T>((_resolve) => {
		resolve = _resolve
	})
	return { promise, resolve }
}

/**
 * A named checkpoint for deterministic concurrency tests: a participant calls
 * `pass()` to announce arrival and block; the orchestrator awaits `reached`,
 * then decides when to `release()`. Composing two deferreds keeps an explicit
 * happens-before edge in the test instead of timing luck.
 */
export function createGate(label = 'gate') {
	const reached = createDeferred()
	const released = createDeferred()
	return {
		label,
		reached: reached.promise,
		release: () => released.resolve(),
		async pass() {
			reached.resolve()
			await released.promise
		},
	}
}
