/**
 * #110 — secondary real-bundler smoke layer (serve + serve).
 *
 * Two real Vite dev servers, each with its own PikaCSS plugin invocation,
 * share one project root. This layer verifies adapter wiring only: both
 * invocations set up, transform modules, and serve `import 'pika.css'`
 * through Vite's ordinary CSS pipeline while coexisting. Both servers request
 * modules in the SAME order, so class mappings agree deterministically — the
 * opposite-mapping semantic race oracle lives in the deterministic
 * integration harness (`@pikacss/integration` ctx.concurrency tests), not
 * here, so OS scheduling never decides a correctness assertion.
 */
import type { ViteDevServer } from 'vite'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { createServer } from 'vite'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Collapse the codegen-write debounce so the smoke test polls a short,
// bounded window instead of a production debounce interval.
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
	const dir = await realpath(await mkdtemp(join(tmpdir(), 'pikacss-unplugin-concurrent-')))
	createdDirs.push(dir)
	return dir
}

async function bootServer(root: string) {
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
		plugins: [pikaPlugin],
	})
	createdServers.push(server)
	return server
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

function classNameIn(code: string | null | undefined) {
	return code?.match(/pk-[A-Za-z]+/)?.[0]
}

function cssRulesOf(css: string) {
	const rules = new Map<string, string>()
	for (const [, id, value] of css.matchAll(/\.(pk-[A-Za-z]+)\s*\{\s*(?:color|display)\s*:\s*([a-z]+)/g))
		rules.set(id!, value!)
	return rules
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

describe('concurrent vite dev servers sharing one project root (#110 smoke)', () => {
	it('two serve invocations coexist: both transform modules and serve pika.css through the normal CSS pipeline', async () => {
		const root = await createTempDir()
		await mkdir(join(root, 'src'), { recursive: true })
		await writeFile(join(root, 'pika.config.ts'), 'export default {}\n', 'utf8')
		await writeFile(join(root, 'src/red.ts'), 'export const red = pika({ color: \'red\' })\n', 'utf8')
		await writeFile(join(root, 'src/flex.ts'), 'export const flex = pika({ display: \'flex\' })\n', 'utf8')
		await writeFile(join(root, 'src/entry.ts'), 'import \'pika.css\'\nexport * from \'./red\'\nexport * from \'./flex\'\n', 'utf8')

		const serverA = await bootServer(root)
		const serverB = await bootServer(root)

		// Same request order on both invocations: this smoke layer checks
		// wiring under coexistence, not the race semantics.
		const results = []
		for (const server of [serverA, serverB]) {
			const red = await server.transformRequest('/src/red.ts')
			const flex = await server.transformRequest('/src/flex.ts')
			results.push({ server, red: classNameIn(red?.code), flex: classNameIn(flex?.code) })
		}

		for (const { red, flex } of results) {
			expect(red)
				.toBeDefined()
			expect(flex)
				.toBeDefined()
			expect(red)
				.not.toBe(flex)
		}

		// The codegen write lands off the request path; poll the observable end
		// state instead of assuming scheduling.
		const [first] = results
		const cssReady = await waitForAsync(async () => {
			const rules = cssRulesOf(await readFile(join(root, 'pika.gen.css'), 'utf8')
				.catch(() => ''))
			return results.every(({ red, flex }) => rules.has(red!) && rules.has(flex!))
		})
		expect(cssReady)
			.toBe(true)
		expect(first)
			.toBeDefined()

		// `import 'pika.css'` resolves per invocation and flows through Vite's
		// ordinary CSS pipeline: the rewritten import must load as a CSS module
		// carrying this invocation's declarations.
		for (const { server } of results) {
			const entry = await server.transformRequest('/src/entry.ts')
			expect(entry?.code)
				.toBeDefined()
			const cssImport = entry!.code.match(/import\s+"([^"]+)"/)?.[1]
			expect(cssImport)
				.toBeDefined()
			expect(cssImport)
				.not.toBe('pika.css')
			const cssModule = await server.transformRequest(cssImport!)
			// The dev CSS module embeds pretty-printed CSS with `\n` escapes;
			// compare declarations whitespace-insensitively.
			const flattened = cssModule?.code.replace(/\\n/g, '')
				.replace(/\s+/g, '')
			expect(flattened)
				.toContain('color:red')
			expect(flattened)
				.toContain('display:flex')
		}
	}, TEST_TIMEOUT)
})
