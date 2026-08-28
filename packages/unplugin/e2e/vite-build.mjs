// Standalone end-to-end check: run a REAL `vite build` with the actual PikaCSS
// Vite plugin (no mocks) over a `.ts` + `.tsx` fixture and assert that the
// macro calls are rewritten and the atomic CSS is emitted. This covers the AST
// compiler pipeline through a genuine bundler build — the gap the mock-based
// unit tests cannot reach.
//
// Run standalone (not under Vitest): a nested `vite build` inside the Vitest
// worker does not run the transform hook reliably. Invoked via `pnpm test:e2e`.
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import process from 'node:process'
import pikaVite from '@pikacss/unplugin-pikacss/vite'
import { join } from 'pathe'
import { build, createServer } from 'vite'

const created = []

async function buildFixture() {
	// realpath: on macOS os.tmpdir() (/var/folders/...) is a symlink to
	// /private/var/...; Vite canonicalizes the build root while the relative
	// transform filter would see the uncanonicalized path, so the transform hook
	// would be skipped. Real projects have a canonical root.
	const root = await realpath(await mkdtemp(join(tmpdir(), 'pikacss-e2e-')))
	created.push(root)
	await mkdir(join(root, 'src'), { recursive: true })
	await writeFile(join(root, 'src/widget.tsx'), 'export const cls = pika({ display: \'flex\' })\n')
	await writeFile(
		join(root, 'src/entry.ts'),
		'import \'pika.css\'\nimport { cls } from \'./widget\'\nexport const c = pika({ color: \'red\' })\nexport { cls }\n',
	)

	const outDir = join(root, 'dist')
	await build({
		root,
		logLevel: 'silent',
		plugins: [pikaVite({ cwd: root })],
		build: {
			outDir,
			cssCodeSplit: false,
			lib: { entry: join(root, 'src/entry.ts'), formats: ['es'], fileName: 'entry' },
		},
	})

	const files = await readdir(outDir)
	const css = await readFile(join(outDir, files.find(f => f.endsWith('.css'))), 'utf8')
	const js = await readFile(join(outDir, files.find(f => f.endsWith('.mjs'))), 'utf8')
	return { css, js }
}

function assert(condition, message) {
	if (!condition) {
		throw new Error(`E2E assertion failed: ${message}`)
	}
}

async function writeSharedProject() {
	const root = await realpath(await mkdtemp(join(tmpdir(), 'pikacss-e2e-concurrent-')))
	created.push(root)
	await mkdir(join(root, 'src'), { recursive: true })
	await writeFile(join(root, 'src/red.ts'), 'export const red = pika({ color: \'red\' })\n')
	await writeFile(
		join(root, 'src/entry.ts'),
		'import \'pika.css\'\nimport { red } from \'./red\'\nexport const flex = pika({ display: \'flex\' })\nexport { red }\n',
	)
	return root
}

function buildOnce(root, outDir) {
	return build({
		root,
		logLevel: 'silent',
		plugins: [pikaVite({ cwd: root })],
		build: {
			outDir,
			cssCodeSplit: false,
			lib: { entry: join(root, 'src/entry.ts'), formats: ['es'], fileName: 'entry' },
		},
	})
}

async function readDist(outDir) {
	const files = await readdir(outDir)
	const css = await readFile(join(outDir, files.find(f => f.endsWith('.css'))), 'utf8')
	const js = await readFile(join(outDir, files.find(f => f.endsWith('.mjs'))), 'utf8')
	return { css, js }
}

// #110 smoke: two concurrent production builds (independent plugin
// invocations) sharing one project root. Both scan the same scope, so their
// outputs agree deterministically; this checks adapter wiring survives
// coexistence, not race semantics (the deterministic race oracle lives in
// the @pikacss/integration concurrency tests).
async function buildPlusBuildConcurrent() {
	const root = await writeSharedProject()
	const [distA, distB] = [join(root, 'dist-a'), join(root, 'dist-b')]
	await Promise.all([buildOnce(root, distA), buildOnce(root, distB)])

	for (const [label, outDir] of [['build A', distA], ['build B', distB]]) {
		const { css, js } = await readDist(outDir)
		assert(!js.includes('pika('), `${label}: transformed JS should not contain a pika( call`)
		assert(/color:\s*red/.test(css), `${label}: CSS should contain color: red`)
		assert(/display:\s*flex/.test(css), `${label}: CSS should contain display: flex`)
	}
}

// #110 smoke: a production build runs while a dev server on the same root
// stays live. Wiring-level checks only: both invocations complete and the
// dev server keeps transforming after the build finished.
async function servePlusBuildConcurrent() {
	const root = await writeSharedProject()
	const server = await createServer({
		root,
		configFile: false,
		logLevel: 'silent',
		optimizeDeps: { noDiscovery: true },
		appType: 'custom',
		server: { middlewareMode: true, watch: null },
		plugins: [pikaVite({ cwd: root })],
	})
	try {
		const before = await server.transformRequest('/src/red.ts')
		assert(before?.code != null && !before.code.includes('pika('), 'serve: module should transform before the build')

		const outDir = join(root, 'dist-serve-build')
		await buildOnce(root, outDir)
		const { css, js } = await readDist(outDir)
		assert(!js.includes('pika('), 'build: transformed JS should not contain a pika( call')
		assert(/color:\s*red/.test(css), 'build: CSS should contain color: red')

		const after = await server.transformRequest('/src/entry.ts')
		assert(after?.code != null && !after.code.includes('pika('), 'serve: module should still transform after a concurrent build')
	}
	finally {
		await server.close()
	}
}

async function run() {
	try {
		const first = await buildFixture()

		// Styles from both the .ts entry and the .tsx module reached the CSS.
		assert(/color:\s*red/.test(first.css), 'CSS should contain color: red from the .ts entry')
		assert(/display:\s*flex/.test(first.css), 'CSS should contain display: flex from the .tsx module')
		// The macro calls were rewritten to class strings, not left as calls.
		assert(!first.js.includes('pika('), 'transformed JS should not contain a pika( call')

		// Production builds are reproducible (full scan canonicalizes order).
		const second = await buildFixture()
		assert(first.css === second.css, 'CSS should be byte-identical across repeated builds')

		await buildPlusBuildConcurrent()
		await servePlusBuildConcurrent()

		console.error('✅ vite build e2e passed')
	}
	catch (error) {
		console.error(`❌ ${error?.message ?? error}`)
		process.exitCode = 1
	}
	finally {
		await Promise.all(created.map(dir => rm(dir, { recursive: true, force: true })))
	}
}

run()
