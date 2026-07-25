import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const runtimeRoot = dirname(fileURLToPath(import.meta.url))
const manifestPath = join(runtimeRoot, 'package.json')
const stampDir = join(runtimeRoot, '.bootstrap')
const stampPath = join(stampDir, 'package.sha256')
const nodeModulesPath = join(runtimeRoot, 'node_modules')
const lockfilePath = join(runtimeRoot, 'pnpm-lock.yaml')

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const packageManagerSpec = typeof manifest.packageManager === 'string'
	? manifest.packageManager
	: null

const commandMap = {
	analyze: 'analyze',
	translate: 'translate',
	verify: 'verify',
	install: 'install',
}

function printHelp() {
	console.log([
		'Usage: node ./.github/skills/maintain-docs/scripts/bootstrap.mjs <command> [args...]',
		'',
		'Commands:',
		'  analyze    Unified analysis: find missing docs pages and detect drift in existing pages.',
		'  translate  Detect i18n sync status, reset zh-TW directory, prepare files for translation.',
		'  verify     Mark docs pages as verified and snapshot their current source hashes. Requires --validated.',
		'  install    Only install or refresh the runtime-local dependencies.',
		'',
		'The bootstrapper uses the prompt-adjacent runtime package.json and prefers Corepack so the workflow remains self-contained.',
	].join('\n'))
}

function commandAvailable(command, args = ['--version']) {
	const result = spawnSync(command, args, { stdio: 'ignore' })
	return result.status === 0
}

function resolvePackageManager() {
	if (!packageManagerSpec)
		throw new Error('The prompt-adjacent runtime package.json must declare packageManager for self-bootstrapping.')

	const [name] = packageManagerSpec.split('@')
	if (name !== 'pnpm')
		throw new Error(`Unsupported package manager for this skill: ${packageManagerSpec}`)

	if (commandAvailable('corepack')) {
		return {
			command: 'corepack',
			argsPrefix: ['pnpm'],
			label: `corepack ${packageManagerSpec}`,
		}
	}

	if (commandAvailable('pnpm')) {
		return {
			command: 'pnpm',
			argsPrefix: [],
			label: 'pnpm (fallback without Corepack)',
		}
	}

	throw new Error('Neither Corepack nor pnpm is available. Install Node with Corepack enabled, or install pnpm manually.')
}

function manifestFingerprint() {
	return createHash('sha256')
		.update(readFileSync(manifestPath, 'utf8'))
		.digest('hex')
}

function readInstalledFingerprint() {
	if (!existsSync(stampPath))
		return null
	return readFileSync(stampPath, 'utf8')
		.trim() || null
}

async function writeInstalledFingerprint(fingerprint) {
	await mkdir(stampDir, { recursive: true })
	await writeFile(stampPath, `${fingerprint}\n`, 'utf8')
}

async function ensureInstalled() {
	const expectedFingerprint = manifestFingerprint()
	const installedFingerprint = readInstalledFingerprint()
	const packageManager = resolvePackageManager()

	if (existsSync(nodeModulesPath) && installedFingerprint === expectedFingerprint)
		return

	const installArgs = [
		...packageManager.argsPrefix,
		'install',
		'--ignore-workspace',
		...(existsSync(lockfilePath) ? ['--frozen-lockfile'] : []),
	]

	const install = spawnSync(packageManager.command, installArgs, {
		cwd: runtimeRoot,
		stdio: 'inherit',
	})

	if (install.status !== 0)
		process.exit(install.status ?? 1)

	await writeInstalledFingerprint(expectedFingerprint)
}

async function main() {
	const [requestedCommand, ...rest] = process.argv.slice(2)

	if (!requestedCommand || requestedCommand === '--help' || requestedCommand === '-h' || requestedCommand === 'help') {
		printHelp()
		return
	}

	const mappedCommand = commandMap[requestedCommand]
	if (!mappedCommand) {
		console.error(`Unsupported command: ${requestedCommand}`)
		printHelp()
		process.exit(1)
	}

	await ensureInstalled()
	const packageManager = resolvePackageManager()

	if (mappedCommand === 'install')
		return

	const run = spawnSync(packageManager.command, [...packageManager.argsPrefix, 'run', mappedCommand, '--', ...rest], {
		cwd: runtimeRoot,
		stdio: 'inherit',
		env: {
			...process.env,
			PIKACSS_MAINTAIN_DOCS_RUNTIME_ROOT: resolve(runtimeRoot),
		},
	})

	if (run.status !== 0)
		process.exit(run.status ?? 1)
}

main()
	.catch((error) => {
		console.error(error)
		process.exit(1)
	})
