/**
 * #148 P1 watcher bridge: Engine dependencies are initialization/finalization
 * state. Integration owns fixed-point semantics; Vite owns only native watch
 * registration and host-change delivery.
 */
import type { ViteDevServer } from 'vite'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { createServer } from 'vite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { projectConfigSource } from './testProjectConfig'

const WAIT_TIMEOUT = 15_000
const TEST_TIMEOUT = 30_000
const createdDirs: string[] = []
const createdServers: ViteDevServer[] = []

async function createTempDir() {
	const dir = await realpath(await mkdtemp(join(tmpdir(), 'pikacss-unplugin-deps-')))
	createdDirs.push(dir)
	return dir
}

async function waitFor(predicate: () => boolean, timeout = WAIT_TIMEOUT) {
	const deadline = Date.now() + timeout
	while (!predicate()) {
		if (Date.now() > deadline)
			return false
		await new Promise<void>(resolve => setTimeout(resolve, 10))
	}
	return true
}

async function bootProject(root: string, configSource: string) {
	await mkdir(join(root, 'src'), { recursive: true })
	await writeFile(join(root, 'pika.config.ts'), configSource, 'utf8')
	await writeFile(join(root, 'src/comp.ts'), 'export const cls = pika({ color: \'red\' })\n', 'utf8')
	const { default: pikacss } = await import('./vite')
	const pikaPlugin = pikacss({ cwd: root })
	const server = await createServer({
		root,
		configFile: false,
		logLevel: 'silent',
		optimizeDeps: { noDiscovery: true },
		appType: 'custom',
		server: { middlewareMode: true, watch: null },
		plugins: [pikaPlugin],
	})
	createdServers.push(server)
	const watchChange = [pikaPlugin].flat()
		.map(plugin => (plugin as any).watchChange)
		.find(candidate => typeof candidate === 'function')
	if (watchChange == null)
		throw new Error('PikaCSS watchChange hook not found')
	return { server, watchChange }
}

afterEach(async () => {
	vi.restoreAllMocks()
	delete (globalThis as any).__pikaDependencyConfigurations
	delete (globalThis as any).__pikaDirectoryConfigurations
	await Promise.allSettled(createdServers.splice(0)
		.map(server => server.close()))
	await Promise.allSettled(createdDirs.splice(0)
		.map(dir => rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })))
})

describe('projectRuntime dependency watcher bridge (#148 P1)', () => {
	it('arms an initialization-time file dependency before activation, retries the fixed point, and reloads on change', async () => {
		const root = await createTempDir()
		const depFile = join(root, 'tokens.json')
		await writeFile(depFile, '{"version":1}\n', 'utf8')
		const config = projectConfigSource(`{
			engine: {
				plugins: [{
					name: 'test:file-dependency',
					configureEngine(configurator) {
						globalThis.__pikaDependencyConfigurations = (globalThis.__pikaDependencyConfigurations ?? 0) + 1
						configurator.runtime.addConfigDependency(${JSON.stringify(depFile)})
					},
				}],
			},
		}`)
		const { server, watchChange } = await bootProject(root, config)
		const first = await server.transformRequest('/src/comp.ts')
		expect(first?.code)
			.toContain('pk-')
		expect((globalThis as any).__pikaDependencyConfigurations)
			.toBe(2)

		const hotSend = vi.spyOn((server.environments as any).client.hot, 'send')
		await writeFile(depFile, '{"version":2}\n', 'utf8')
		await watchChange.call({ addWatchFile: vi.fn() }, depFile, { event: 'update' })
		expect(await waitFor(() => hotSend.mock.calls.some(call => (call[0] as any)?.type === 'full-reload')))
			.toBe(true)
	}, TEST_TIMEOUT)

	it('maps directory-membership dependencies to direct-member host changes only', async () => {
		const root = await createTempDir()
		const iconDir = join(root, 'icons')
		const nestedDir = join(iconDir, 'nested')
		await mkdir(nestedDir, { recursive: true })
		const config = projectConfigSource(`{
			engine: {
				plugins: [{
					name: 'test:directory-dependency',
					configureEngine(configurator) {
						globalThis.__pikaDirectoryConfigurations = (globalThis.__pikaDirectoryConfigurations ?? 0) + 1
						configurator.runtime.addConfigDirectoryMembershipDependency(${JSON.stringify(iconDir)})
					},
				}],
			},
		}`)
		const { server, watchChange } = await bootProject(root, config)
		await server.transformRequest('/src/comp.ts')
		expect((globalThis as any).__pikaDirectoryConfigurations)
			.toBe(2)

		const hotSend = vi.spyOn((server.environments as any).client.hot, 'send')
		const nestedFile = join(nestedDir, 'ignored.svg')
		await writeFile(nestedFile, '<svg/>', 'utf8')
		await watchChange.call({ addWatchFile: vi.fn() }, nestedFile, { event: 'create' })
		await new Promise<void>(resolve => setTimeout(resolve, 50))
		expect(hotSend.mock.calls.some(call => (call[0] as any)?.type === 'full-reload'))
			.toBe(false)

		const directFile = join(iconDir, 'home.svg')
		await writeFile(directFile, '<svg/>', 'utf8')
		await watchChange.call({ addWatchFile: vi.fn() }, directFile, { event: 'create' })
		expect(await waitFor(() => hotSend.mock.calls.some(call => (call[0] as any)?.type === 'full-reload')))
			.toBe(true)
	}, TEST_TIMEOUT)
})
