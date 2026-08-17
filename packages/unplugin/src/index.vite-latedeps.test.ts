/**
 * #122 — config dependencies discovered AFTER setup (e.g. a watchable icon
 * collection's backing file, first seen while resolving inside engine.use()
 * during a module transform) must become watchable without another setup
 * cycle: the vite dev watcher learns the path immediately, a content
 * baseline is recorded, and a later change to the file triggers engine
 * re-derivation exactly like a setup-time dependency.
 */
import type { ViteDevServer } from 'vite'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { createServer } from 'vite'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('perfect-debounce', () => ({
	debounce: (fn: (...args: any[]) => any) => (...args: any[]) => fn(...args),
}))

const WAIT_TIMEOUT = 15_000
const TEST_TIMEOUT = 30_000

const createdDirs: string[] = []
const createdServers: ViteDevServer[] = []

async function createTempDir() {
	const dir = await realpath(await mkdtemp(join(tmpdir(), 'pikacss-unplugin-latedeps-')))
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

afterEach(async () => {
	vi.restoreAllMocks()
	await Promise.allSettled(createdServers.splice(0)
		.map(server => server.close()))
	await Promise.allSettled(createdDirs.splice(0)
		.map(dir => rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })))
})

describe('late-discovered config dependencies (#122)', () => {
	it('registers a transform-time dependency with the running watcher and reloads on its change', async () => {
		const root = await createTempDir()
		await mkdir(join(root, 'src'), { recursive: true })
		await mkdir(join(root, 'icons'), { recursive: true })
		const depFile = join(root, 'icons/home.svg')
		await writeFile(depFile, '<svg>v1</svg>', 'utf8')
		await writeFile(join(root, 'src/comp.ts'), 'export const cls = pika({ color: \'red\' })\n', 'utf8')

		// Simulates a watchable-collection style plugin: the backing file is
		// only discovered while resolving during a module transform.
		let capturedEngine: any
		const lateDependencyPlugin = {
			name: 'test:late-dependency',
			configureEngine: (engine: any) => {
				capturedEngine = engine
			},
			transformStyleItems: (styleItems: any[]) => {
				capturedEngine.addConfigDependency(depFile)
				return styleItems
			},
		}

		const { default: pikacss } = await import('./vite')
		const pikaPlugin = pikacss({
			cwd: root,
			config: { plugins: [lateDependencyPlugin] } as any,
			tsCodegen: false,
			autoCreateConfig: false,
		})
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
		const watcherAdd = vi.spyOn(server.watcher, 'add')

		// The dependency does not exist anywhere until this transform runs.
		const first = await server.transformRequest('/src/comp.ts')
		expect(first?.code)
			.toContain('pk-')
		expect(watcherAdd.mock.calls.some(call => [call[0]].flat()
			.includes(depFile)))
			.toBe(true)

		// A change to the late dependency now follows the normal
		// config-dependency lifecycle: content diff → engine re-derivation →
		// client full reload.
		const hotSend = vi.spyOn((server.environments as any).client.hot, 'send')
		await writeFile(depFile, '<svg>v2</svg>', 'utf8')
		const hook = [pikaPlugin].flat()
			.map(plugin => (plugin as any).watchChange)
			.find(candidate => typeof candidate === 'function')
		await hook!.call({} as any, depFile, { event: 'update' })

		expect(await waitFor(() => hotSend.mock.calls.some(call => (call[0] as any)?.type === 'full-reload')))
			.toBe(true)
	}, TEST_TIMEOUT)

	it('a touched-but-unchanged late dependency does not force a reload', async () => {
		const root = await createTempDir()
		await mkdir(join(root, 'src'), { recursive: true })
		await mkdir(join(root, 'icons'), { recursive: true })
		const depFile = join(root, 'icons/logo.svg')
		await writeFile(depFile, '<svg>stable</svg>', 'utf8')
		await writeFile(join(root, 'src/comp.ts'), 'export const cls = pika({ color: \'red\' })\n', 'utf8')

		let capturedEngine: any
		const lateDependencyPlugin = {
			name: 'test:late-dependency',
			configureEngine: (engine: any) => {
				capturedEngine = engine
			},
			transformStyleItems: (styleItems: any[]) => {
				capturedEngine.addConfigDependency(depFile)
				return styleItems
			},
		}

		const { default: pikacss } = await import('./vite')
		const pikaPlugin = pikacss({
			cwd: root,
			config: { plugins: [lateDependencyPlugin] } as any,
			tsCodegen: false,
			autoCreateConfig: false,
		})
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

		await server.transformRequest('/src/comp.ts')

		// Baseline was snapshotted at registration time: an event with
		// identical bytes must be treated as a no-op, not a reload storm.
		const hotSend = vi.spyOn((server.environments as any).client.hot, 'send')
		const hook = [pikaPlugin].flat()
			.map(plugin => (plugin as any).watchChange)
			.find(candidate => typeof candidate === 'function')
		await hook!.call({} as any, depFile, { event: 'update' })
		await new Promise<void>(resolve => setTimeout(resolve, 100))

		expect(hotSend.mock.calls.some(call => (call[0] as any)?.type === 'full-reload'))
			.toBe(false)
	}, TEST_TIMEOUT)
})
