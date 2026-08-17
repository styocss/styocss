/**
 * #121 — dedicated future-warning compatibility path. Runs the PikaCSS dev
 * flow with Vite's `future.remove*` deprecation warnings enabled for every
 * server-global API the plugin (or this suite's own drivers) still relies on.
 * Test-only: users never need these flags. The flags themselves only log
 * today; the real early signal is that this file functionally exercises every
 * warned API (transformRequest, pluginContainer, moduleGraph, hot) in one
 * flow, so a Vite release that removes or reshapes any of them fails here
 * before it fails users. Version-gated so an older supported Vite without the flags
 * skips cleanly instead of failing on unknown config.
 */
import type { ViteDevServer } from 'vite'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { createServer, version as viteVersion } from 'vite'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('perfect-debounce', () => ({
	debounce: (fn: (...args: any[]) => any) => (...args: any[]) => fn(...args),
}))

// `future.remove*` flags landed with the Environment API line (Vite 6+); the
// supported peer range is ^7 || ^8, so this only skips on hosts testing an
// out-of-range older Vite.
const viteMajor = Number(viteVersion.split('.')[0])
const supportsFutureFlags = viteMajor >= 6

const WAIT_TIMEOUT = 15_000
const TEST_TIMEOUT = 30_000

async function waitFor(predicate: () => boolean, timeout = WAIT_TIMEOUT) {
	const deadline = Date.now() + timeout
	while (!predicate()) {
		if (Date.now() > deadline)
			return false
		await new Promise<void>(resolve => setTimeout(resolve, 10))
	}
	return true
}
const createdDirs: string[] = []
const createdServers: ViteDevServer[] = []

async function createTempDir() {
	const dir = await realpath(await mkdtemp(join(tmpdir(), 'pikacss-unplugin-future-')))
	createdDirs.push(dir)
	return dir
}

afterEach(async () => {
	vi.restoreAllMocks()
	await Promise.allSettled(createdServers.splice(0)
		.map(server => server.close()))
	await Promise.allSettled(createdDirs.splice(0)
		.map(dir => rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })))
})

describe.skipIf(!supportsFutureFlags)('vite future-removal warnings compatibility (#121)', () => {
	it('the dev transform + engine re-derivation flow works with all relevant future warnings enabled', async () => {
		const root = await createTempDir()
		await mkdir(join(root, 'src'), { recursive: true })
		await writeFile(join(root, 'pika.config.ts'), 'export default {}\n', 'utf8')
		await writeFile(join(root, 'src/comp.ts'), 'export const cls = pika({ color: \'red\' })\n', 'utf8')

		const { default: pikacss } = await import('./vite')
		const pikaPlugin = pikacss({
			cwd: root,
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
			// Every server-global API PikaCSS's Vite adapter touches in
			// production (moduleGraph, hot) plus the ones this test suite's own
			// drivers use (transformRequest, pluginContainer). Kept as `warn`:
			// the run must stay functional; a Vite release that hard-removes
			// one of these breaks this file before it breaks users.
			future: {
				removeServerModuleGraph: 'warn',
				removeServerHot: 'warn',
				removeServerTransformRequest: 'warn',
				removeServerPluginContainer: 'warn',
				removeServerReloadModule: 'warn',
			},
			plugins: [pikaPlugin],
		})
		createdServers.push(server)

		// Transform still works and mints an atomic id.
		const first = await server.transformRequest('/src/comp.ts')
		expect(first?.code)
			.toContain('pk-')

		// The runtime CSS still resolves through the plugin container.
		const resolved = await server.pluginContainer.resolveId('pika.css')
		expect(resolved?.id)
			.toContain(join('.pikacss', 'runs'))

		// Engine re-derivation still invalidates through server.moduleGraph and
		// reloads through server.hot — the two warned APIs production depends on.
		const hotSend = vi.spyOn((server.environments as any).client.hot, 'send')
		await writeFile(join(root, 'pika.config.ts'), 'export default { prefix: \'fut-\' }\n', 'utf8')
		const hook = [pikaPlugin].flat()
			.map(plugin => (plugin as any).watchChange)
			.find(candidate => typeof candidate === 'function')
		await hook!.call({} as any, join(root, 'pika.config.ts'), { event: 'update' })

		expect(await waitFor(() => hotSend.mock.calls.some(call => (call[0] as any)?.type === 'full-reload')))
			.toBe(true)

		// The re-requested module carries the new generation's prefix.
		const second = await server.transformRequest('/src/comp.ts')
		expect(second?.code)
			.toContain('fut-')
	}, TEST_TIMEOUT)
})
