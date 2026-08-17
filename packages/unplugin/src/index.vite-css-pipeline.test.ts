/**
 * #111 — the invocation-owned runtime CSS must keep flowing through Vite's
 * ordinary CSS pipeline: user PostCSS configuration applies to it, and
 * rewriting it produces a normal CSS HMR update rather than a full reload.
 * Both tests resolve `pika.css` the way the bundler does; they never assume
 * a fixed physical location.
 */
import type { ViteDevServer } from 'vite'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { createServer } from 'vite'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Collapse the codegen-write debounce so tests poll a short, bounded window.
vi.mock('perfect-debounce', () => ({
	debounce: (fn: (...args: any[]) => any) => (...args: any[]) => fn(...args),
}))

const WAIT_TIMEOUT = 5_000
const TEST_TIMEOUT = 30_000

const createdDirs: string[] = []
const createdServers: ViteDevServer[] = []

async function createTempDir() {
	// realpath: on macOS `os.tmpdir()` is a symlink and Vite resolves module
	// ids to their real path; a symlinked root breaks load fallback.
	const dir = await realpath(await mkdtemp(join(tmpdir(), 'pikacss-unplugin-css-pipeline-')))
	createdDirs.push(dir)
	return dir
}

async function setupProject(viteCssOptions?: Record<string, any>) {
	const root = await createTempDir()
	await mkdir(join(root, 'src'), { recursive: true })
	await writeFile(join(root, 'pika.config.ts'), 'export default {}\n', 'utf8')
	await writeFile(join(root, 'src/red.ts'), 'export const red = pika({ color: \'red\' })\n', 'utf8')
	await writeFile(join(root, 'src/entry.ts'), 'import \'pika.css\'\nexport * from \'./red\'\n', 'utf8')

	const { default: pikacss } = await import('./vite')
	const server = await createServer({
		root,
		configFile: false,
		logLevel: 'silent',
		optimizeDeps: { noDiscovery: true },
		appType: 'custom',
		server: { middlewareMode: true, watch: null },
		plugins: [pikacss({ cwd: root, tsCodegen: false, autoCreateConfig: false })],
		...(viteCssOptions ? { css: viteCssOptions } : {}),
	})
	createdServers.push(server)

	const resolveCss = async () => {
		const resolved = await server.pluginContainer.resolveId('pika.css')
		if (resolved == null)
			throw new Error('pika.css did not resolve')
		return resolved.id
	}

	return { root, server, resolveCss }
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

afterEach(async () => {
	vi.restoreAllMocks()
	await Promise.allSettled(createdServers.splice(0)
		.map(server => server.close()))
	await Promise.allSettled(createdDirs.splice(0)
		.map(dir =>
			// Windows can hold a handle on a directory Vite just touched.
			rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }),
		))
})

describe('runtime CSS through the ordinary Vite CSS pipeline (#111)', () => {
	it('applies user PostCSS configuration to the generated runtime CSS', async () => {
		const marker = '--pika-postcss-marker'
		const { server, resolveCss } = await setupProject({
			postcss: {
				plugins: [
					{
						postcssPlugin: 'test:append-marker',
						Once(cssRoot: any) {
							cssRoot.append({ selector: ':root' })
							cssRoot.last.append({ prop: marker, value: 'applied' })
						},
					},
				],
			},
		})

		await server.transformRequest('/src/red.ts')
		const cssPath = await resolveCss()
		// The codegen write lands off the request path; poll the pipeline's
		// observable end state.
		let cssModule: Awaited<ReturnType<typeof server.transformRequest>> = null
		const transformed = await waitForAsync(async () => {
			server.moduleGraph.invalidateAll()
			cssModule = await server.transformRequest(cssPath)
				.catch(() => null)
			return cssModule?.code.includes(marker) === true && cssModule.code.includes('color') === true
		})
		expect(transformed)
			.toBe(true)
		// PostCSS ran over the actual generated content, not a copy.
		expect(cssModule!.code)
			.toContain('pk-')
	}, TEST_TIMEOUT)

	it('rewriting the invocation-owned CSS produces a normal CSS HMR update', async () => {
		const { server, root, resolveCss } = await setupProject()

		await server.transformRequest('/src/red.ts')
		const cssPath = await resolveCss()
		// Load the CSS module into the graph the way a browser would.
		const ready = await waitForAsync(async () =>
			(await server.transformRequest(cssPath)
				.catch(() => null)) != null)
		expect(ready)
			.toBe(true)

		// Imported-CSS HMR updates travel over the client environment channel;
		// the plugin's own full-reload path uses `server.hot`. Watch both.
		const sent: any[] = []
		const record = ((payload: any) => {
			sent.push(payload)
		}) as any
		vi.spyOn(server.hot, 'send')
			.mockImplementation(record)
		vi.spyOn((server as any).environments.client.hot, 'send')
			.mockImplementation(record)

		// A new style enters the engine and the invocation rewrites its own
		// runtime CSS; the bundler watcher sees an ordinary file change.
		await writeFile(join(root, 'src/blue.ts'), 'export const blue = pika({ color: \'blue\' })\n', 'utf8')
		await server.transformRequest('/src/blue.ts')
		const rewritten = await waitForAsync(async () =>
			(await server.transformRequest(cssPath)
				.catch(() => null)) != null)
		expect(rewritten)
			.toBe(true)
		server.watcher.emit('change', cssPath)

		// Imported CSS hot-swaps as a self-accepting update targeting the
		// runtime CSS module (Vite reserves `css-update` for <link> sheets).
		const updated = await waitForAsync(async () => sent.some(payload =>
			payload?.type === 'update'
			&& payload.updates?.some((update: any) => update.path === cssPath || update.acceptedPath === cssPath)))
		expect(updated)
			.toBe(true)
		// The rewrite must not degrade into a full reload.
		expect(sent.some(payload => payload?.type === 'full-reload'))
			.toBe(false)
	}, TEST_TIMEOUT)
})
