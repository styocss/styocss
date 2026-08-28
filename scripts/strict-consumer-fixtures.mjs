import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import process from 'node:process'
import { promisify } from 'node:util'
import { join, resolve } from 'pathe'

const execFileAsync = promisify(execFile)
const workspaceRoot = resolve(import.meta.dirname, '..')
const workspaceManifest = JSON.parse(await readFile(join(workspaceRoot, 'package.json'), 'utf8'))
const workspacePackageManager = workspaceManifest.packageManager
assertPackageManager(workspacePackageManager)
const internalPackages = ['core', 'config', 'integration', 'eslint', 'unplugin', 'nuxt']
const packageNames = {
	core: '@pikacss/core',
	config: '@pikacss/config',
	integration: '@pikacss/integration',
	eslint: '@pikacss/eslint-config',
	unplugin: '@pikacss/unplugin-pikacss',
	nuxt: '@pikacss/nuxt-pikacss',
}

function assertPackageManager(value) {
	if (typeof value !== 'string' || !value.startsWith('pnpm@'))
		throw new Error(`Strict consumer fixtures require a pinned pnpm packageManager; got ${String(value)}`)
}

function assert(condition, message) {
	if (!condition)
		throw new Error(`Strict consumer fixture assertion failed: ${message}`)
}

async function run(command, args, options = {}) {
	try {
		const result = await execFileAsync(command, args, {
			cwd: options.cwd ?? workspaceRoot,
			env: { ...process.env, ...(options.env ?? {}) },
			maxBuffer: 32 * 1024 * 1024,
		})
		if (options.echo !== false) {
			if (result.stdout)
				process.stdout.write(result.stdout)
			if (result.stderr)
				process.stderr.write(result.stderr)
		}
		return result
	}
	catch (error) {
		if (error?.stdout)
			process.stdout.write(error.stdout)
		if (error?.stderr)
			process.stderr.write(error.stderr)
		throw error
	}
}

async function buildAndPack(packDir) {
	const tarballs = {}
	for (const pkg of internalPackages) {
		const name = packageNames[pkg]
		process.stderr.write(`\n[strict-consumer] building ${name}\n`)
		await run('pnpm', ['--filter', name, 'build'])
		const { stdout } = await run('pnpm', ['--filter', name, 'pack', '--pack-destination', packDir], { echo: false })
		const tarball = stdout.trim()
			.split('\n')
			.at(-1)
		assert(tarball != null && tarball.endsWith('.tgz'), `pnpm pack did not return a tarball for ${name}`)
		tarballs[name] = resolve(tarball)
	}
	return tarballs
}

function pikaOverrides(tarballs) {
	return Object.fromEntries(Object.entries(tarballs)
		.map(([name, path]) => [name, `file:${path}`]))
}

async function writeJson(path, value) {
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

async function writeStrictNpmrc(root) {
	await writeFile(join(root, '.npmrc'), [
		'node-linker=isolated',
		'shamefully-hoist=false',
		'public-hoist-pattern[]=',
		'auto-install-peers=true',
		'trust-policy=no-downgrade',
		'trust-policy-exclude[]=semver@6.3.1',
		'',
	].join('\n'))
}

async function directPikaLinks(root) {
	const scope = join(root, 'node_modules', '@pikacss')
	try {
		return (await readdir(scope)).sort()
	}
	catch (error) {
		if (error?.code === 'ENOENT')
			return []
		throw error
	}
}

async function assertOnlyDirectPika(root, expected) {
	const links = await directPikaLinks(root)
	assert(JSON.stringify(links) === JSON.stringify([expected]), `expected only @pikacss/${expected} at consumer root, found ${links.join(', ') || '(none)'}`)
	const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
	const pikaDirect = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })
		.filter(name => name.startsWith('@pikacss/'))
	assert(JSON.stringify(pikaDirect) === JSON.stringify([`@pikacss/${expected}`]), `consumer package.json must directly declare exactly @pikacss/${expected}; got ${pikaDirect.join(', ')}`)
}

async function install(root) {
	await run('pnpm', ['install', '--ignore-scripts', '--reporter=append-only'], { cwd: root })
}

async function createCoreConsumer(root, tarballs) {
	await mkdir(join(root, 'src'), { recursive: true })
	await writeStrictNpmrc(root)
	await writeJson(join(root, 'package.json'), {
		name: 'strict-core-consumer',
		private: true,
		type: 'module',
		packageManager: workspacePackageManager,
		devDependencies: {
			'@pikacss/core': `file:${tarballs['@pikacss/core']}`,
			'@types/node': '25.0.3',
			'typescript': '6.0.3',
		},
		pnpm: { overrides: pikaOverrides(tarballs) },
	})
	await writeFile(join(root, 'src/main.ts'), [
		'import { createEngine, defineEngineConfig } from \'@pikacss/core\'',
		'',
		'const config = defineEngineConfig({ prefix: \'strict-\' })',
		'const engine = await createEngine(config)',
		'const ids = await engine.use({ color: \'red\', display: \'flex\' })',
		'if (ids.length !== 2) throw new Error(\'expected two atomic ids\')',
		'const css = await engine.renderAtomicStyles(false)',
		'if (!/color:\s*red/.test(css) || !/display:\s*flex/.test(css)) throw new Error(\'core render missing expected declarations\')',
		'process.stdout.write(\'core-only-ok\\n\')',
		'',
	].join('\n'))
	await writeJson(join(root, 'tsconfig.json'), {
		compilerOptions: {
			target: 'ESNext',
			module: 'NodeNext',
			moduleResolution: 'NodeNext',
			strict: true,
			types: ['node'],
			noEmit: true,
		},
		include: ['src/**/*.ts'],
	})
}

async function validateCoreConsumer(root) {
	process.stderr.write('\n[strict-consumer] installing Core-only consumer\n')
	await install(root)
	await assertOnlyDirectPika(root, 'core')
	await run('pnpm', ['exec', 'tsc', '--noEmit'], { cwd: root })
	const result = await run('node', ['src/main.ts'], { cwd: root, echo: false })
	assert(result.stdout.includes('core-only-ok'), 'Core-only consumer must create/use/render an Engine')
	process.stderr.write('[strict-consumer] Core-only consumer passed\n')
}

async function createEslintConsumer(root, tarballs) {
	await mkdir(join(root, 'src'), { recursive: true })
	await writeStrictNpmrc(root)
	await writeJson(join(root, 'package.json'), {
		name: 'strict-eslint-consumer',
		private: true,
		type: 'module',
		packageManager: workspacePackageManager,
		devDependencies: {
			'@pikacss/eslint-config': `file:${tarballs['@pikacss/eslint-config']}`,
			'eslint': '10.6.0',
		},
		pnpm: { overrides: pikaOverrides(tarballs) },
	})
	await writeFile(join(root, 'eslint.config.mjs'), [
		'import pikacss from \'@pikacss/eslint-config\'',
		'',
		'export default [await pikacss()]',
		'',
	].join('\n'))
	await writeFile(join(root, 'src/good.js'), 'export const cls = pika({ color: \'red\' })\n')
	await writeFile(join(root, 'src/bad.js'), 'export const cls = pika({ color: runtimeColor })\n')
}

async function validateEslintConsumer(root) {
	process.stderr.write('\n[strict-consumer] installing ESLint-only consumer\n')
	await install(root)
	await assertOnlyDirectPika(root, 'eslint-config')
	await run('pnpm', ['exec', 'eslint', 'src/good.js'], { cwd: root })
	let failed = false
	let failureText = ''
	try {
		await run('pnpm', ['exec', 'eslint', 'src/bad.js'], { cwd: root, echo: false })
	}
	catch (error) {
		failed = true
		failureText = `${error?.stdout ?? ''}\n${error?.stderr ?? ''}`
	}
	assert(failed, 'ESLint-only consumer must reject a dynamic PikaCSS argument')
	assert(failureText.includes('pikacss/static-usage'), 'ESLint failure must come from pikacss/static-usage')
	const integrationAtRoot = (await directPikaLinks(root)).includes('integration')
	assert(!integrationAtRoot, 'ESLint-only consumer must not rely on a root/hoisted @pikacss/integration link')
	process.stderr.write('[strict-consumer] ESLint-only consumer passed\n')
}

async function createViteConsumer(root, tarballs) {
	await mkdir(join(root, 'src'), { recursive: true })
	await writeStrictNpmrc(root)
	await writeJson(join(root, 'package.json'), {
		name: 'strict-vite-consumer',
		private: true,
		type: 'module',
		packageManager: workspacePackageManager,
		devDependencies: {
			'@pikacss/unplugin-pikacss': `file:${tarballs['@pikacss/unplugin-pikacss']}`,
			'@types/node': '25.0.3',
			'typescript': '6.0.3',
			'vite': '8.1.3',
		},
		pnpm: { overrides: pikaOverrides(tarballs) },
	})
	await writeFile(join(root, 'pika.config.ts'), [
		'import { defineConfig } from \'@pikacss/unplugin-pikacss\'',
		'',
		'export default defineConfig({',
		'  scan: { include: \'src/**/*.ts\' },',
		'})',
		'',
	].join('\n'))
	await writeFile(join(root, 'vite.config.ts'), [
		'import pikacss from \'@pikacss/unplugin-pikacss/vite\'',
		'import { defineConfig } from \'vite\'',
		'',
		'export default defineConfig({',
		'  plugins: [pikacss()],',
		'})',
		'',
	].join('\n'))
	await writeFile(join(root, 'index.html'), '<div id="app"></div><script type="module" src="/src/main.ts"></script>\n')
	await writeFile(join(root, 'src/main.ts'), [
		'import \'pika.css\'',
		'document.querySelector(\'#app\')!.className = pika({ color: \'red\', display: \'flex\' })',
		'',
	].join('\n'))
	await writeJson(join(root, 'tsconfig.json'), {
		compilerOptions: {
			target: 'ESNext',
			lib: ['ESNext', 'DOM', 'DOM.Iterable'],
			module: 'ESNext',
			moduleResolution: 'Bundler',
			strict: true,
			types: ['vite/client', 'node'],
			noEmit: true,
		},
		include: ['src/**/*.ts', 'vite.config.ts', 'pika.config.ts', '.pikacss/pika.gen.ts'],
	})
}

async function validateViteConsumer(root) {
	process.stderr.write('\n[strict-consumer] installing Vite consumer\n')
	await install(root)
	await assertOnlyDirectPika(root, 'unplugin-pikacss')

	await run('pnpm', ['exec', 'pikacss', 'prepare'], { cwd: root })
	const typegen = await readFile(join(root, '.pikacss', 'pika.gen.ts'), 'utf8')
	assert(typegen.includes('@pikacss/unplugin-pikacss'), `Vite Typegen must target directly installed unplugin package; refs: ${[...typegen.matchAll(/@pikacss\/[\w./-]+/g)].map(match => match[0])
		.join(', ') || '(none)'}`)
	assert(!typegen.includes('@pikacss/core'), 'Vite Typegen must not require a direct @pikacss/core import')

	await run('pnpm', ['exec', 'tsc', '--noEmit'], { cwd: root })
	await run('pnpm', ['exec', 'vite', 'build'], { cwd: root })
	const assets = join(root, 'dist', 'assets')
	const files = await readdir(assets)
	const cssFile = files.find(file => file.endsWith('.css'))
	const jsFile = files.find(file => file.endsWith('.js'))
	assert(cssFile != null, 'Vite build must emit CSS')
	assert(jsFile != null, 'Vite build must emit JS')
	const css = await readFile(join(assets, cssFile), 'utf8')
	const js = await readFile(join(assets, jsFile), 'utf8')
	assert(/color:\s*red/.test(css), 'Vite build CSS must contain color:red')
	assert(/display:\s*flex/.test(css), 'Vite build CSS must contain display:flex')
	assert(!js.includes('pika('), 'Vite build output must not retain pika() calls')

	process.stderr.write('[strict-consumer] Vite consumer passed\n')
}

async function createNuxtConsumer(root, tarballs) {
	await mkdir(join(root, 'app'), { recursive: true })
	await writeStrictNpmrc(root)
	await writeJson(join(root, 'package.json'), {
		name: 'strict-nuxt-consumer',
		private: true,
		type: 'module',
		packageManager: workspacePackageManager,
		devDependencies: {
			'@pikacss/nuxt-pikacss': `file:${tarballs['@pikacss/nuxt-pikacss']}`,
			'nuxt': '4.4.8',
			'typescript': '6.0.3',
		},
		pnpm: { overrides: pikaOverrides(tarballs) },
	})
	await writeFile(join(root, 'nuxt.config.ts'), [
		'export default defineNuxtConfig({',
		'  modules: [\'@pikacss/nuxt-pikacss\'],',
		'})',
		'',
	].join('\n'))
	await writeFile(join(root, 'pika.config.ts'), [
		'import { defineConfig } from \'@pikacss/nuxt-pikacss\'',
		'',
		'export default defineConfig({',
		'  scan: { include: [\'app/**/*.vue\', \'app/**/*.ts\'] },',
		'})',
		'',
	].join('\n'))
	await writeFile(join(root, 'app/app.vue'), [
		'<template>',
		'  <main :class="pika({ color: \'red\', display: \'grid\' })">strict Nuxt consumer</main>',
		'</template>',
		'',
	].join('\n'))
}

async function findGeneratedReference(root) {
	const candidates = ['nuxt.d.ts', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'tsconfig.shared.json']
	const hits = []
	for (const name of candidates) {
		const path = join(root, '.nuxt', name)
		try {
			const content = await readFile(path, 'utf8')
			if (content.includes('.pikacss/pika.gen.ts'))
				hits.push(name)
		}
		catch (error) {
			if (error?.code !== 'ENOENT')
				throw error
		}
	}
	return hits
}

async function validateNuxtConsumer(root) {
	process.stderr.write('\n[strict-consumer] installing Nuxt consumer\n')
	await install(root)
	await assertOnlyDirectPika(root, 'nuxt-pikacss')

	await run('pnpm', ['exec', 'pikacss', 'prepare'], { cwd: root })
	let typegen = await readFile(join(root, '.pikacss', 'pika.gen.ts'), 'utf8')
	assert(typegen.includes('@pikacss/nuxt-pikacss'), `Nuxt package-local prepare must target directly installed Nuxt package; refs: ${[...typegen.matchAll(/@pikacss\/[\w./-]+/g)].map(match => match[0])
		.join(', ') || '(none)'}`)
	assert(!typegen.includes('@pikacss/unplugin-pikacss'), 'Nuxt Typegen must not target transitive unplugin package')

	await rm(join(root, '.pikacss'), { recursive: true, force: true })
	await rm(join(root, '.nuxt'), { recursive: true, force: true })
	await run('pnpm', ['exec', 'nuxt', 'prepare'], { cwd: root })
	typegen = await readFile(join(root, '.pikacss', 'pika.gen.ts'), 'utf8')
	assert(typegen.includes('@pikacss/nuxt-pikacss'), 'nuxt prepare must materialize Nuxt-targeted PikaCSS Typegen')
	const references = await findGeneratedReference(root)
	assert(references.length > 0, 'Nuxt generated type context must reference .pikacss/pika.gen.ts')

	await run('pnpm', ['exec', 'nuxt', 'build'], { cwd: root, env: { NUXT_TELEMETRY_DISABLED: '1' } })
	const outputDir = join(root, '.output')
	assert((await stat(outputDir)).isDirectory(), 'Nuxt build must emit .output')
	typegen = await readFile(join(root, '.pikacss', 'pika.gen.ts'), 'utf8')
	assert(typegen.includes('@pikacss/nuxt-pikacss'), 'Nuxt build must preserve the directly installed Nuxt package as Typegen identity')
	assert(!typegen.includes('@pikacss/unplugin-pikacss'), 'Nuxt build must not overwrite Typegen identity with the transitive unplugin package')

	process.stderr.write(`[strict-consumer] Nuxt consumer passed (PikaCSS reference in ${references.join(', ')})\n`)
}

async function main() {
	const tempRoot = await mkdtemp(join(tmpdir(), 'pikacss-strict-consumers-'))
	const packDir = join(tempRoot, 'packs')
	await mkdir(packDir, { recursive: true })
	try {
		const tarballs = await buildAndPack(packDir)
		const coreRoot = join(tempRoot, 'core-consumer')
		const eslintRoot = join(tempRoot, 'eslint-consumer')
		const viteRoot = join(tempRoot, 'vite-consumer')
		const nuxtRoot = join(tempRoot, 'nuxt-consumer')
		await Promise.all([coreRoot, eslintRoot, viteRoot, nuxtRoot].map(root => mkdir(root)))
		await createCoreConsumer(coreRoot, tarballs)
		await createEslintConsumer(eslintRoot, tarballs)
		await createViteConsumer(viteRoot, tarballs)
		await createNuxtConsumer(nuxtRoot, tarballs)
		await validateCoreConsumer(coreRoot)
		await validateEslintConsumer(eslintRoot)
		await validateViteConsumer(viteRoot)
		await validateNuxtConsumer(nuxtRoot)
		process.stderr.write('\n✅ strict packed Core/ESLint/Vite/Nuxt consumer fixtures passed\n')
	}
	finally {
		await rm(tempRoot, { recursive: true, force: true })
	}
}

main()
	.catch((error) => {
		process.stderr.write(`\n❌ ${error?.stack ?? error}\n`)
		process.exitCode = 1
	})
