/**
 * #121 — Vite environment ownership semantics. One plugin invocation owns one
 * IntegrationContext/engine/atomic namespace/run-scoped pika.css shared by
 * every environment (client, ssr, custom); environments differ only in module
 * instances and invalidation. On engine re-derivation no environment may keep
 * a module transformed under the previous atomic-ID generation, and the
 * user-visible full reload belongs to the client environment's HMR channel.
 */
import type { ViteDevServer } from 'vite'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { createServer } from 'vite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { engineProjectConfigSource, projectConfigSource } from './testProjectConfig'

const TEMPLATE_QUERY = '?vue&type=template'
const WAIT_TIMEOUT = 15_000
const TEST_TIMEOUT = 30_000

const createdDirs: string[] = []
const createdServers: ViteDevServer[] = []

async function createTempDir() {
	const dir = await realpath(await mkdtemp(join(tmpdir(), 'pikacss-unplugin-env-')))
	createdDirs.push(dir)
	return dir
}

/** Same shape as index.vite-dev.test.ts: one file owning a query-suffixed sub-module. */
function createSplittingPlugin() {
	const templateCode = new Map<string, string>()
	return {
		name: 'test:split-into-sub-module',
		load(id: string) {
			if (!id.includes(TEMPLATE_QUERY))
				return null
			return templateCode.get(id) ?? null
		},
		transform(code: string, id: string) {
			if (id.includes(TEMPLATE_QUERY) || !id.endsWith('.ts'))
				return null
			templateCode.set(`${id}${TEMPLATE_QUERY}`, code)
			const basename = id.slice(id.lastIndexOf('/') + 1)
			return `export * from ${JSON.stringify(`/src/${basename}${TEMPLATE_QUERY}`)}`
		},
	}
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

function classNameIn(code: string | null | undefined) {
	return code?.match(/pk-[A-Za-z]+/)?.[0]
}

async function setupProject(options: { split?: boolean } = {}) {
	const root = await createTempDir()
	await mkdir(join(root, 'src'), { recursive: true })
	await writeFile(join(root, 'pika.config.ts'), projectConfigSource(), 'utf8')
	await writeFile(join(root, 'src/comp.ts'), 'export const cls = pika({ color: \'red\' })\n', 'utf8')
	await writeFile(join(root, 'src/other.ts'), 'export const cls = pika({ color: \'blue\' })\n', 'utf8')

	const { default: pikacss } = await import('./vite')
	const pikaPlugin = pikacss({
		cwd: root,
	})
	const server = await createServer({
		root,
		configFile: false,
		logLevel: 'silent',
		optimizeDeps: { noDiscovery: true },
		appType: 'custom',
		server: { middlewareMode: true, watch: null },
		// A user-defined environment on top of the built-in client/ssr pair:
		// the ownership contract must hold for it too.
		environments: {
			edge: {},
		},
		plugins: options.split ? [pikaPlugin, createSplittingPlugin()] : [pikaPlugin],
	})
	createdServers.push(server)

	const changeConfig = async (body: string) => {
		await writeFile(join(root, 'pika.config.ts'), engineProjectConfigSource(body), 'utf8')
		const hook = [pikaPlugin].flat()
			.map(plugin => (plugin as any).watchChange)
			.find(candidate => typeof candidate === 'function')
		await hook!.call({} as any, join(root, 'pika.config.ts'), { event: 'update' })
	}

	return { root, server, changeConfig, fileOf: (name: string) => join(root, `src/${name}.ts`) }
}

afterEach(async () => {
	vi.restoreAllMocks()
	await Promise.allSettled(createdServers.splice(0)
		.map(server => server.close()))
	await Promise.allSettled(createdDirs.splice(0)
		.map(dir => rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })))
})

describe('vite environment ownership (#121)', () => {
	it('one plugin invocation shares one engine, atomic namespace, and runtime CSS across environments', async () => {
		const { server } = await setupProject()

		const client = await server.transformRequest('/src/comp.ts')
		const ssr = await server.transformRequest('/src/comp.ts', { ssr: true })

		// Same source, two environments, one atomic namespace: identical id.
		expect(classNameIn(client?.code))
			.toBeDefined()
		expect(classNameIn(ssr?.code))
			.toBe(classNameIn(client?.code))

		// One run-scoped runtime CSS artifact for the whole invocation.
		const resolved = await server.pluginContainer.resolveId('pika.css')
		expect(resolved?.id)
			.toContain(join('.pikacss', 'runs'))
	}, TEST_TIMEOUT)

	it('invalidates client, ssr, and custom environment modules on engine re-derivation and reloads the client', async () => {
		const { server, changeConfig, fileOf } = await setupProject({ split: true })
		const file = fileOf('comp')

		// Populate all three environment graphs (plus the SFC-style sub-node).
		await server.transformRequest('/src/comp.ts')
		await server.transformRequest(`/src/comp.ts${TEMPLATE_QUERY}`)
		await server.transformRequest('/src/comp.ts', { ssr: true })
		await (server.environments as any).edge.transformRequest('/src/comp.ts')

		const environments = server.environments as any
		const nodesOf = (env: any) => [...(env.moduleGraph.getModulesByFile(file) ?? [])]
		expect(nodesOf(environments.client).length)
			.toBeGreaterThanOrEqual(2)
		expect(nodesOf(environments.ssr).length)
			.toBeGreaterThanOrEqual(1)
		expect(nodesOf(environments.edge).length)
			.toBeGreaterThanOrEqual(1)
		// Only nodes that were actually requested carry a transform result;
		// record them so the post-invalidation check targets real state.
		const transformedNodes = [environments.client, environments.ssr, environments.edge]
			.flatMap(env => nodesOf(env))
			.filter(node => node.transformResult != null)
		expect(transformedNodes.length)
			.toBeGreaterThanOrEqual(3)

		const hotSend = vi.spyOn(environments.client.hot, 'send')

		// Engine re-derivation: restarts atomic-ID allocation, so every
		// environment's transformed modules belong to a dead generation.
		await changeConfig('{ prefix: \'env-\' }')
		expect(await waitFor(() => hotSend.mock.calls.some(call => (call[0] as any)?.type === 'full-reload')))
			.toBe(true)

		// No environment keeps a module from the previous generation — the
		// Vue-style query sub-node included.
		for (const node of transformedNodes) {
			expect(node.transformResult)
				.toBeNull()
		}
		const templateNode = nodesOf(environments.client)
			.find(node => node.id?.includes(TEMPLATE_QUERY))
		expect(templateNode)
			.toBeDefined()
		expect(templateNode!.transformResult)
			.toBeNull()
	}, TEST_TIMEOUT)

	it('ordinary transforms that do not re-derive the engine trigger no full reload', async () => {
		const { server } = await setupProject()
		const environments = server.environments as any

		await server.transformRequest('/src/comp.ts')
		const hotSend = vi.spyOn(environments.client.hot, 'send')

		// A new module joining the run extends the shared namespace without
		// restarting it: no reload may be forced.
		await server.transformRequest('/src/other.ts')
		await server.transformRequest('/src/other.ts', { ssr: true })
		await new Promise<void>(resolve => setTimeout(resolve, 50))

		expect(hotSend.mock.calls.some(call => (call[0] as any)?.type === 'full-reload'))
			.toBe(false)
	}, TEST_TIMEOUT)
})
