import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
	vi.doUnmock('@pikacss/config/host')
	vi.resetModules()
})

async function createRuntimeWithRawLoadFailure(reason: unknown) {
	vi.resetModules()
	vi.doMock('@pikacss/config/host', async () => {
		const actual = await vi.importActual<typeof import('@pikacss/config/host')>('@pikacss/config/host')
		return {
			...actual,
			loadPikaConfig: async () => Promise.reject(reason),
		}
	})
	const { createProjectRuntime } = await import('./projectRuntime')
	return createProjectRuntime({ projectRoot: '/tmp/pikacss-project-runtime-load-error', mode: 'oneshot' })
}

describe('projectRuntime raw Config-host failure wrapping', () => {
	it('wraps an unexpected Error from the Config host', async () => {
		const runtime = await createRuntimeWithRawLoadFailure(new Error('raw-error'))
		await expect(runtime.requestReload())
			.rejects.toThrow('Failed to load PikaCSS config: raw-error')
	})

	it('wraps an unexpected non-Error from the Config host', async () => {
		const runtime = await createRuntimeWithRawLoadFailure('raw-string')
		await expect(runtime.requestReload())
			.rejects.toThrow('Failed to load PikaCSS config: raw-string')
	})
})
