import type { Plugin, ViteDevServer } from 'vite'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { createServer } from 'vite'
import { afterEach, describe, expect, it, vi } from 'vitest'

// limit: this collapses both the setup debounce and the 300ms codegen-write
// debounce, so the ordering between the full reload and the CSS write is not
// what this test covers — only the module graph invalidation is.
vi.mock('perfect-debounce', () => ({
	debounce: (fn: (...args: any[]) => any) => (...args: any[]) => fn(...args),
}))

// The real query `@vitejs/plugin-vue` emits. It matters: `ctx.transform`
// short-circuits on `vue&type=`, so a made-up query would send the sub-module
// down the `dropModule` path instead and stop mirroring the reported case.
const TEMPLATE_QUERY = '?vue&type=template'

const createdDirs: string[] = []
const createdServers: ViteDevServer[] = []

async function createTempDir() {
	// realpath matters: on macOS `os.tmpdir()` is a symlink, and Vite resolves
	// module ids to their real path. A symlinked root makes every file look
	// outside the served root and load-fallback refuses to read it.
	const dir = await realpath(await mkdtemp(join(tmpdir(), 'pikacss-unplugin-vite-')))
	createdDirs.push(dir)
	return dir
}

/**
 * Stand-in for `@vitejs/plugin-vue`, mirroring one property of it: a single
 * source file owning a main module plus a `?vue&type=template` sub-module.
 * It is not an SFC compiler and makes no claim beyond that module shape.
 *
 * It deliberately has no `enforce`, so it runs *after* PikaCSS's `pre`
 * transform and carries PikaCSS's already-rewritten output — the same ordering
 * that makes a Vue SFC's template block hold generated class names that were
 * never registered under the sub-module's own id.
 */
function createSplittingPlugin(templateUrl: string): Plugin {
	const templateCode = new Map<string, string>()
	return {
		name: 'test:split-into-sub-module',
		load(id) {
			if (!id.includes(TEMPLATE_QUERY))
				return null
			return templateCode.get(id) ?? null
		},
		transform(code, id) {
			if (id.includes(TEMPLATE_QUERY) || !id.endsWith('Comp.ts'))
				return null
			templateCode.set(`${id}${TEMPLATE_QUERY}`, code)
			return `export * from ${JSON.stringify(templateUrl)}`
		},
	}
}

async function setupProject() {
	const root = await createTempDir()
	await mkdir(join(root, 'src'), { recursive: true })
	await writeFile(join(root, 'pika.config.ts'), 'export default {}\n', 'utf8')
	await writeFile(
		join(root, 'src/Comp.ts'),
		'export const cls = pika({ color: \'red\' })\n',
		'utf8',
	)

	const { default: pikacss } = await import('./vite')
	const pikaPlugin = pikacss({
		cwd: root,
		cssCodegen: 'pika.gen.css',
		tsCodegen: false,
		autoCreateConfig: false,
	})
	const templateUrl = `/src/Comp.ts${TEMPLATE_QUERY}`
	const server = await createServer({
		root,
		configFile: false,
		logLevel: 'silent',
		optimizeDeps: { noDiscovery: true },
		appType: 'custom',
		server: { middlewareMode: true, watch: null },
		plugins: [pikaPlugin, createSplittingPlugin(templateUrl)],
	})
	createdServers.push(server)

	// Populate the graph the way a browser would: the main module first, then
	// the sub-module it imports.
	await server.transformRequest('/src/Comp.ts')
	await server.transformRequest(templateUrl)

	const compFile = join(root, 'src/Comp.ts')
	return { root, server, compFile, templateUrl, pikaPlugin: [pikaPlugin].flat() }
}

// Comfortably inside the explicit `testTimeout` below, so a failure reports the
// assertion that actually failed instead of being cut short by Vitest.
const WAIT_TIMEOUT = 5_000

async function waitFor(predicate: () => boolean, timeout = WAIT_TIMEOUT) {
	const deadline = Date.now() + timeout
	while (!predicate()) {
		if (Date.now() > deadline)
			return false
		await new Promise<void>(resolve => setTimeout(resolve, 10))
	}
	return true
}

function getWatchChange(plugins: Plugin[]) {
	for (const plugin of plugins) {
		const hook = plugin.watchChange
		if (typeof hook === 'function')
			return hook.bind(plugin)
	}
	throw new Error('watchChange hook not found on the PikaCSS Vite plugin')
}

afterEach(async () => {
	vi.restoreAllMocks()

	while (createdServers.length > 0)
		await createdServers.pop()!.close()

	while (createdDirs.length > 0)
		await rm(createdDirs.pop()!, { recursive: true, force: true })
})

describe('vite dev server re-derivation', () => {
	it('invalidates every module graph node of a usage file and forces a full reload', async () => {
		const { root, server, compFile, templateUrl, pikaPlugin } = await setupProject()

		const nodes = server.moduleGraph.getModulesByFile(compFile)
		// The precondition the bug depended on: one file, several graph nodes,
		// only one of which `getModuleById(file)` can reach.
		expect(nodes?.size)
			.toBe(2)
		const subModule = server.moduleGraph.getModuleById(templateUrl)
			?? [...nodes!].find(mod => mod.id?.includes(TEMPLATE_QUERY))
		expect(subModule?.transformResult)
			.not
			.toBeNull()

		const sendSpy = vi.fn()
		const channel = (server as any).hot ?? (server as any).ws
		vi.spyOn(channel, 'send')
			.mockImplementation(sendSpy)

		// Re-derive the engine: the config content changes, so every atomic
		// style id is reassigned from scratch.
		await writeFile(join(root, 'pika.config.ts'), 'export default { /* changed */ }\n', 'utf8')
		await getWatchChange(pikaPlugin)(join(root, 'pika.config.ts'), { event: 'update' })
		// The reload runs on the plugin's internal setup chain, which is not
		// exposed; wait for its observable end state instead of a fixed delay.
		const reloaded = await waitFor(() => sendSpy.mock.calls.length > 0)

		expect(reloaded)
			.toBe(true)
		expect(sendSpy)
			.toHaveBeenCalledWith({ type: 'full-reload' })
		// Without the fix this sub-module keeps its previous transform result —
		// class names from the old id generation, served against the new CSS.
		expect(subModule?.transformResult)
			.toBeNull()
	}, 20_000)
})
