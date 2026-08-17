/**
 * #111 — the invocation-owned runtime CSS must keep flowing through Vite's
 * ordinary CSS pipeline: user PostCSS configuration applies to it, and
 * rewriting it produces a normal CSS HMR update rather than a full reload.
 * Both tests resolve `pika.css` the way the bundler does; they never assume
 * a fixed physical location.
 */
import type { ViteDevServer } from 'vite'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
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

interface SetupProjectOptions {
	viteCssOptions?: Record<string, any>
	/** Enable the real chokidar watcher instead of the default disabled one. */
	realWatcher?: boolean
}

async function setupProject({ viteCssOptions, realWatcher = false }: SetupProjectOptions = {}) {
	const root = await createTempDir()
	await mkdir(join(root, 'src'), { recursive: true })
	await writeFile(join(root, 'pika.config.ts'), 'export default {}\n', 'utf8')
	// Self-accepting so real-watcher edits hot-update instead of dead-ending
	// into a full reload (plain modules without accept() always full-reload).
	await writeFile(join(root, 'src/red.ts'), 'export const red = pika({ color: \'red\' })\nif (import.meta.hot) { import.meta.hot.accept() }\n', 'utf8')
	await writeFile(join(root, 'src/entry.ts'), 'import \'pika.css\'\nexport * from \'./red\'\n', 'utf8')

	const { default: pikacss } = await import('./vite')
	const server = await createServer({
		root,
		configFile: false,
		logLevel: 'silent',
		optimizeDeps: { noDiscovery: true },
		appType: 'custom',
		server: { middlewareMode: true, watch: realWatcher ? {} : null },
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
		const { server, resolveCss } = await setupProject({ viteCssOptions: {
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
		} })

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
		// The payload carries the module URL, which matches the absolute fs
		// path on POSIX but not on Windows (`/D:/...`), so compare by the
		// invocation-unique run-directory suffix.
		const runSuffix = cssPath.split('/')
			.slice(-3)
			.join('/')
		const targetsRuntimeCss = (value: unknown) => typeof value === 'string' && value.endsWith(runSuffix)
		const updated = await waitForAsync(async () => sent.some(payload =>
			payload?.type === 'update'
			&& payload.updates?.some((update: any) => targetsRuntimeCss(update.path) || targetsRuntimeCss(update.acceptedPath))))
		expect(updated)
			.toBe(true)
		// The rewrite must not degrade into a full reload.
		expect(sent.some(payload => payload?.type === 'full-reload'))
			.toBe(false)
	}, TEST_TIMEOUT)

	// #111 acceptance: the physical runtime CSS must stay watchable — the
	// real chokidar watcher, not a manually emitted event, must observe the
	// writer's temp+rename replacement and drive a normal HMR update.
	it('the real file watcher observes runtime CSS rewrites and drives a normal HMR update', async () => {
		const { server, root, resolveCss } = await setupProject({ realWatcher: true })
		// Diagnostic trail: on failure the assertion message reports exactly
		// which filesystem events the watcher saw and which payloads were
		// sent, so platform-specific watcher semantics are visible in CI.
		const startedAt = Date.now()
		const watcherEvents: string[] = []
		for (const eventName of ['add', 'change', 'unlink', 'addDir'] as const) {
			server.watcher.on(eventName, (eventPath: string) => {
				watcherEvents.push(`${eventName}@${Date.now() - startedAt}ms:${eventPath.split('/')
					.slice(-2)
					.join('/')}`)
			})
		}

		await server.transformRequest('/src/red.ts')
		const cssPath = await resolveCss()
		const ready = await waitForAsync(async () =>
			(await server.transformRequest(cssPath)
				.catch(() => null)) != null)
		expect(ready)
			.toBe(true)

		const sent: any[] = []
		const record = ((payload: any) => {
			sent.push(payload)
		}) as any
		vi.spyOn(server.hot, 'send')
			.mockImplementation(record)
		vi.spyOn((server as any).environments.client.hot, 'send')
			.mockImplementation(record)

		// Let the boot-time writes settle first: with the debounce collapsed
		// for tests, back-to-back rewrites land milliseconds apart, which is
		// a cadence real dev servers never produce (the production write is
		// debounced) and which can race watcher event handling.
		await waitForAsync(async () => {
			const cssEvents = watcherEvents.filter(event => event.includes('pika.css')).length
			await new Promise<void>(resolve => setTimeout(resolve, 300))
			return watcherEvents.filter(event => event.includes('pika.css')).length === cssEvents
		})

		// New styles enter by editing an EXISTING self-accepting module (a
		// brand-new file or a non-accepting module would full-reload for
		// source-side reasons unrelated to the CSS path under test). The
		// invocation rewrites its runtime CSS via the real writer (unique
		// temp + rename). No manual watcher events — the bundler must see
		// the replacement itself.
		await writeFile(
			join(root, 'src/red.ts'),
			'export const red = pika({ color: \'red\' })\nexport const blue = pika({ color: \'blue\' })\nif (import.meta.hot) { import.meta.hot.accept() }\n',
			'utf8',
		)

		const runSuffix = cssPath.split('/')
			.slice(-3)
			.join('/')
		const targetsRuntimeCss = (value: unknown) => typeof value === 'string' && value.endsWith(runSuffix)
		// Watcher latency is environment-dependent; poll the observable end
		// state with a bounded deadline instead of assuming scheduling. The
		// re-request stands in for the browser refetch an HMR client would
		// perform once the watcher invalidated the module.
		let lastRedCode = ''
		const updated = await waitForAsync(async () => {
			lastRedCode = (await server.transformRequest('/src/red.ts')
				.catch(() => null))?.code ?? lastRedCode
			return sent.some(payload =>
				payload?.type === 'update'
				&& payload.updates?.some((update: any) => targetsRuntimeCss(update.path) || targetsRuntimeCss(update.acceptedPath)))
		}, 10_000)
		const cssOnDisk = await readFile(cssPath, 'utf8')
			.catch(() => '<unreadable>')
		const diagnostics = [
			`watcher=[${watcherEvents.join(', ')}]`,
			`payloads=[${sent.map(payload => payload?.type)
				.join(', ')}]`,
			`cssHasBlue=${cssOnDisk.includes('blue')}`,
			`redClasses=${(lastRedCode.match(/pk-[A-Za-z]+/g) ?? []).length}`,
		].join(' ')
		expect(updated, `no HMR update reached the runtime CSS; ${diagnostics}`)
			.toBe(true)
		expect(sent.some(payload => payload?.type === 'full-reload'), `unexpected full reload; ${diagnostics}`)
			.toBe(false)
	}, TEST_TIMEOUT)
})
