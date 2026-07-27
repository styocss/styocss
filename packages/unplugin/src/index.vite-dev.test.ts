import type { Plugin, ViteDevServer } from 'vite'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { createServer } from 'vite'
import { afterEach, describe, expect, it, vi } from 'vitest'

// limit: this collapses both the setup debounce and the codegen-write debounce,
// so the ordering between the full reload and the CSS write is not what these
// tests cover.
vi.mock('perfect-debounce', () => ({
	debounce: (fn: (...args: any[]) => any) => (...args: any[]) => fn(...args),
}))

// The real query `@vitejs/plugin-vue` emits. It matters: `ctx.transform`
// short-circuits on `vue&type=`, so a made-up query would send the sub-module
// down the `dropModule` path instead and stop mirroring the reported case.
const TEMPLATE_QUERY = '?vue&type=template'

// Comfortably inside the explicit per-test timeouts, so a failure reports the
// assertion that actually failed instead of being cut short by Vitest.
const WAIT_TIMEOUT = 5_000
const TEST_TIMEOUT = 20_000

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
 * transform and stashes PikaCSS's already-rewritten output — the same ordering
 * that makes a Vue SFC's template block hold generated class names that were
 * never registered under the sub-module's own id.
 */
function createSplittingPlugin(): Plugin {
	const templateCode = new Map<string, string>()
	return {
		name: 'test:split-into-sub-module',
		load(id) {
			if (!id.includes(TEMPLATE_QUERY))
				return null
			return templateCode.get(id) ?? null
		},
		transform(code, id) {
			if (id.includes(TEMPLATE_QUERY) || !id.endsWith('.ts'))
				return null
			templateCode.set(`${id}${TEMPLATE_QUERY}`, code)
			const basename = id.slice(id.lastIndexOf('/') + 1)
			return `export * from ${JSON.stringify(`/src/${basename}${TEMPLATE_QUERY}`)}`
		},
	}
}

function templateUrlOf(name: string) {
	return `/src/${name}.ts${TEMPLATE_QUERY}`
}

/**
 * Writes a project whose components each declare one `color`, boots a real Vite
 * dev server over it, and returns handles for driving requests by component.
 */
async function setupProject(components: Record<string, string>) {
	const root = await createTempDir()
	await mkdir(join(root, 'src'), { recursive: true })
	await writeFile(join(root, 'pika.config.ts'), 'export default {}\n', 'utf8')
	for (const [name, color] of Object.entries(components)) {
		await writeFile(
			join(root, `src/${name}.ts`),
			`export const cls = pika({ color: '${color}' })\n`,
			'utf8',
		)
	}

	const { default: pikacss } = await import('./vite')
	const pikaPlugin = pikacss({
		cwd: root,
		cssCodegen: 'pika.gen.css',
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
		plugins: [pikaPlugin, createSplittingPlugin()],
	})
	createdServers.push(server)

	return {
		root,
		server,
		plugins: [pikaPlugin].flat(),
		fileOf: (name: string) => join(root, `src/${name}.ts`),
		// The graph keys sub-nodes by their resolved id, not by the request URL,
		// so look them up through the file that owns them.
		subNodeOf: (name: string) => {
			const nodes = server.moduleGraph.getModulesByFile(join(root, `src/${name}.ts`))
			return [...nodes ?? []].find(node => node.id?.includes(TEMPLATE_QUERY))
		},
		// Populate the graph the way a browser would: the main module first, then
		// the sub-module it imports.
		request: async (name: string) => {
			await server.transformRequest(`/src/${name}.ts`)
			return server.transformRequest(templateUrlOf(name))
		},
		readCss: () => readFile(join(root, 'pika.gen.css'), 'utf8'),
		// The watcher is off (`watch: null`), so the bundler hook is driven
		// directly. That means these tests do not cover the watcher-to-hook edge.
		changeConfig: async (body: string) => {
			await writeFile(join(root, 'pika.config.ts'), `export default ${body}\n`, 'utf8')
			const hook = [pikaPlugin].flat()
				.map(plugin => plugin.watchChange)
				.find(candidate => typeof candidate === 'function')
			if (hook == null)
				throw new Error('watchChange hook not found on the PikaCSS Vite plugin')
			await hook.call({} as any, join(root, 'pika.config.ts'), { event: 'update' })
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

async function waitForAsync(predicate: () => Promise<boolean>, timeout = WAIT_TIMEOUT) {
	const deadline = Date.now() + timeout
	while (!(await predicate())) {
		if (Date.now() > deadline)
			return false
		await new Promise<void>(resolve => setTimeout(resolve, 10))
	}
	return true
}

function spyOnFullReload(server: ViteDevServer) {
	const calls: any[] = []
	vi.spyOn(server.hot, 'send')
		.mockImplementation(((payload: any) => {
			calls.push(payload)
		}) as any)
	return {
		calls,
		seen: () => calls.some(payload => payload?.type === 'full-reload'),
	}
}

function classNameIn(code: string | null | undefined) {
	return code?.match(/pk-[A-Za-z]+/)?.[0]
}

function cssRulesOf(css: string) {
	const rules = new Map<string, string>()
	for (const [, id, color] of css.matchAll(/\.(pk-[A-Za-z]+)\s*\{\s*color:\s*([a-z]+)/g))
		rules.set(id!, color!)
	return rules
}

afterEach(async () => {
	vi.restoreAllMocks()

	// Each teardown step is independent: one failure must not strand the rest.
	await Promise.allSettled(createdServers.splice(0)
		.map(server => server.close()))
	await Promise.allSettled(createdDirs.splice(0)
		.map(dir =>
		// Windows can hold a handle on a directory Vite just touched.
			rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }),
		))
})

describe('vite dev server re-derivation', () => {
	it('invalidates every module graph node of a usage file and forces a full reload', async () => {
		const project = await setupProject({ Comp: 'red' })
		await project.request('Comp')

		const nodes = project.server.moduleGraph.getModulesByFile(project.fileOf('Comp'))
		// The precondition the bug depended on: one file, several graph nodes,
		// only one of which `getModuleById(file)` can reach.
		expect(nodes?.size)
			.toBeGreaterThanOrEqual(2)
		const subModule = project.subNodeOf('Comp')
		expect(subModule)
			.toBeDefined()
		// Not just "it transformed" — it is holding a generated class name, which
		// is what makes a survivor dangerous rather than merely stale.
		expect(classNameIn(subModule!.transformResult?.code))
			.toBeDefined()

		const reload = spyOnFullReload(project.server)
		await project.changeConfig('{ /* changed */ }')
		// The reload runs on the plugin's internal setup chain, which is not
		// exposed; wait for its observable end state instead of a fixed delay.
		const reloaded = await waitFor(reload.seen)

		expect(reloaded)
			.toBe(true)
		// Without the fix this sub-module keeps its previous transform result —
		// class names from the old id generation, served against the new CSS.
		expect(subModule!.transformResult)
			.toBeNull()
	}, TEST_TIMEOUT)

	it('never serves a class name that the regenerated CSS assigns to another rule', async () => {
		// Two components so the id space can actually be reshuffled: ids are
		// handed out in discovery order, so re-deriving and then re-requesting in
		// the opposite order swaps which declaration owns which name.
		const project = await setupProject({ Alpha: 'red', Beta: 'blue' })
		await project.request('Alpha')
		await project.request('Beta')

		const before = classNameIn(
			project.subNodeOf('Alpha')?.transformResult?.code,
		)
		expect(before)
			.toBeDefined()

		const reload = spyOnFullReload(project.server)
		await project.changeConfig('{ /* changed */ }')
		expect(await waitFor(reload.seen))
			.toBe(true)

		// The reloaded page requests modules in whatever order it resolves them —
		// here the reverse of the first pass, which is what moves Alpha off its
		// original name.
		await project.request('Beta')
		await project.request('Alpha')

		const alpha = classNameIn(
			project.subNodeOf('Alpha')?.transformResult?.code,
		)
		const beta = classNameIn(
			project.subNodeOf('Beta')?.transformResult?.code,
		)
		expect(alpha)
			.toBeDefined()
		expect(beta)
			.toBeDefined()
		// Names really did move; otherwise the assertion below would pass for the
		// wrong reason.
		expect(alpha)
			.not
			.toBe(before)

		// The codegen write lands off the request path, so poll for it rather
		// than assuming it already happened.
		let rules = new Map<string, string>()
		const cssReady = await waitForAsync(async () => {
			rules = cssRulesOf(await project.readCss())
			return rules.has(alpha!) && rules.has(beta!)
		})
		expect(cssReady)
			.toBe(true)

		// The reported failure in one line: the class the module serves must be
		// the class the CSS gives that module's own declaration.
		expect(rules.get(alpha!))
			.toBe('red')
		expect(rules.get(beta!))
			.toBe('blue')
	}, TEST_TIMEOUT)
})
