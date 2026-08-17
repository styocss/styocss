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

describe('dependency listener lifecycle across setups (#122 gate)', () => {
	it('repeated setups keep one effective listener — a fire never multiplies watcher registrations', async () => {
		const root = await createTempDir()
		await mkdir(join(root, 'src'), { recursive: true })
		await mkdir(join(root, 'icons'), { recursive: true })
		const depFile = join(root, 'icons/home.svg')
		await writeFile(depFile, '<svg>v1</svg>', 'utf8')
		await writeFile(join(root, 'src/comp.ts'), 'export const cls = pika({ color: \'red\' })\n', 'utf8')
		// Config-file mode so reloads rebuild the engine (and would rebind a
		// leaked listener every time under the old lifecycle).
		const configBody = (marker: string) => `
export default {
	// ${marker}
	plugins: [{
		name: 'test:late-dependency',
		configureEngine(engine) { globalThis.__pikaDepEngine = engine },
		transformStyleItems(styleItems) {
			globalThis.__pikaDepEngine.addConfigDependency(${JSON.stringify(depFile)})
			return styleItems
		},
	}],
}
`
		await writeFile(join(root, 'pika.config.ts'), configBody('v1'), 'utf8')

		const { default: pikacss } = await import('./vite')
		const pikaPlugin = pikacss({ cwd: root, tsCodegen: false, autoCreateConfig: false })
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
		const hook = [pikaPlugin].flat()
			.map(plugin => (plugin as any).watchChange)
			.find(candidate => typeof candidate === 'function')

		await server.transformRequest('/src/comp.ts')

		// Two successful reloads: under a leaked-listener lifecycle each one
		// stacks another subscription.
		await writeFile(join(root, 'pika.config.ts'), configBody('v2'), 'utf8')
		await hook!.call({} as any, join(root, 'pika.config.ts'), { event: 'update' })
		await writeFile(join(root, 'pika.config.ts'), configBody('v3'), 'utf8')
		await hook!.call({} as any, join(root, 'pika.config.ts'), { event: 'update' })

		// The fresh engine discovers the dependency again on this transform
		// (a NEW module — a re-request of comp.ts would hit the prepared
		// cache and never reach the plugin): exactly one listener must react.
		await writeFile(join(root, 'src/probe.ts'), 'export const probe = pika({ color: \'blue\' })\n', 'utf8')
		const watcherAdd = vi.spyOn(server.watcher, 'add')
		await server.transformRequest('/src/probe.ts')
		const addsForDep = watcherAdd.mock.calls.filter(call => [call[0]].flat()
			.includes(depFile)).length
		expect(addsForDep)
			.toBeLessThanOrEqual(1)
	}, TEST_TIMEOUT)

	it('a rejected replacement engine cannot advance the dependency baseline of the retained engine', async () => {
		const root = await createTempDir()
		await mkdir(join(root, 'src'), { recursive: true })
		await mkdir(join(root, 'icons'), { recursive: true })
		const depFile = join(root, 'icons/tokens.svg')
		await writeFile(depFile, 'bytes-A', 'utf8')
		await writeFile(join(root, 'src/comp.ts'), 'export const cls = pika({ color: \'red\' })\n', 'utf8')

		const goodConfig = (marker: string) => `
export default {
	// ${marker}
	plugins: [{
		name: 'test:setup-dependency',
		configureEngine(engine) { engine.addConfigDependency(${JSON.stringify(depFile)}) },
	}],
}
`
		// Registers the dependency provisionally, then rejects engine creation.
		// The sentinel makes the (deliberately unawaited) reload observable so
		// the test can synchronize on the provisional attempt actually running.
		const explodingConfig = `
export default {
	plugins: [{
		name: 'test:setup-dependency',
		configureEngine(engine) {
			engine.addConfigDependency(${JSON.stringify(depFile)})
			globalThis.__pikaProvisionalRan = true
			throw new Error('provisional boom')
		},
	}],
}
`
		await writeFile(join(root, 'pika.config.ts'), goodConfig('v1'), 'utf8')

		const { default: pikacss } = await import('./vite')
		const pikaPlugin = pikacss({ cwd: root, tsCodegen: false, autoCreateConfig: false })
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
		const hook = [pikaPlugin].flat()
			.map(plugin => (plugin as any).watchChange)
			.find(candidate => typeof candidate === 'function')

		// Baseline: bytes-A, snapshotted by the successful setup.
		await server.transformRequest('/src/comp.ts')

		// The dependency changes on disk, then a broken config makes the
		// REPLACEMENT engine register the path (provisionally, reading
		// bytes-B) and fail. The retained engine's baseline must stay A.
		await writeFile(depFile, 'bytes-B', 'utf8')
		await writeFile(join(root, 'pika.config.ts'), explodingConfig, 'utf8')
		;(globalThis as any).__pikaProvisionalRan = false
		await hook!.call({} as any, join(root, 'pika.config.ts'), { event: 'update' })
		// The reload runs un-awaited inside watchChange; wait until the
		// provisional engine demonstrably registered the dependency and give
		// the retain-last-good tail a beat to settle before repairing.
		expect(await waitFor(() => (globalThis as any).__pikaProvisionalRan === true))
			.toBe(true)
		await new Promise<void>(resolve => setTimeout(resolve, 100))

		// Repair the config on disk (no watcher event for it yet) and deliver
		// the dependency's own change event: bytes-B vs the intact baseline A
		// must retry setup and reload — a poisoned baseline would classify it
		// as unchanged and never recover.
		await writeFile(join(root, 'pika.config.ts'), goodConfig('v2'), 'utf8')
		const hotSend = vi.spyOn((server.environments as any).client.hot, 'send')
		await hook!.call({} as any, depFile, { event: 'update' })

		expect(await waitFor(() => hotSend.mock.calls.some(call => (call[0] as any)?.type === 'full-reload')))
			.toBe(true)
	}, TEST_TIMEOUT)
})
