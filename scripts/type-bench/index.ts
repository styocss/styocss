import type { DimensionName } from './config'
import type { BenchSuite, ProbePosition, ScenarioResult } from './types'
import { execFileSync } from 'node:child_process'
import { rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { compareDeterministicBaseline, loadBaseline, saveBaseline } from './baseline'
import { defaultConfig, generateScenarios, TYPE_BENCH_FIXTURE_PROFILE } from './config'
import { generateFixture } from './fixture-gen'
import { formatCliTable } from './reporters/cli-table'
import { writeJsonReport } from './reporters/json'
import { runTrace } from './runners/trace'
import { runTscDiagnostics } from './runners/tsc'
import { runTsserverLatency } from './runners/tsserver'

const { values: args } = parseArgs({
	options: {
		'dimension': { type: 'string', short: 'd' },
		'runs': { type: 'string', short: 'r' },
		'output': { type: 'string', short: 'o' },
		'trace': { type: 'boolean', short: 't' },
		'tsserver': { type: 'boolean', short: 's' },
		'save-baseline': { type: 'string' },
		'compare': { type: 'string' },
		'ts-versions': { type: 'string' },
		'source-root': { type: 'string' },
		'help': { type: 'boolean', short: 'h' },
	},
	strict: true,
})

if (args.help) {
	console.log(`
Usage: pnpm type-bench [options]

Options:
  -d, --dimension <name>   Only run a specific dimension (callCount, pluginCount, generatedMemberCount, nestingDepth, fileSpread, entryCount, designTokens, designTokensStrict, iconCount)
  -r, --runs <n>           Number of runs per scenario (default: 5)
  -o, --output <path>      Write JSON report to file
  -t, --trace              Run --generateTrace analysis (slower)
  -s, --tsserver           Run tsserver latency measurement (completion, quickInfo)
  --save-baseline <name>   Save results as a named baseline
  --compare <name>         Compare results against a saved baseline
  --ts-versions <versions> Comma-separated TS versions to test (e.g. 5.7,5.8,5.9)
  --source-root <path>     Resolve benchmarked PikaCSS sources from another checkout/worktree
  -h, --help               Show this help
`)
	process.exit(0)
}

const repoRoot = resolve(import.meta.dirname, '../..')
const sourceRoot = args['source-root'] ? resolve(args['source-root']) : repoRoot

const config = {
	...defaultConfig,
	...(args.runs ? { runs: Number.parseInt(args.runs, 10) } : {}),
}

const dimensionFilter = args.dimension as DimensionName | undefined

const RE_VERSION = /Version\s+([\d.]+)/

function getTsVersion(tscPath: string): string {
	try {
		const output = execFileSync(process.execPath, [tscPath, '--version'], { encoding: 'utf-8' })
		const match = output.match(RE_VERSION)
		return match ? match[1]! : 'unknown'
	}
	catch {
		return 'unknown'
	}
}

function getDefaultTscPath(): string {
	return resolve(repoRoot, 'node_modules/typescript/lib/tsc.js')
}

function getDefaultTsserverPath(): string {
	return resolve(repoRoot, 'node_modules/typescript/lib/tsserver.js')
}

/**
 * Install a specific TypeScript version to a temp location and return paths.
 * Uses npx to resolve the version.
 */
function resolveTsVersionPaths(version: string): { tscPath: string, tsserverPath: string } {
	if (!/^[\w.+-]+$/.test(version))
		throw new Error(`Invalid TypeScript version selector: ${version}`)
	const locator = process.platform === 'win32' ? 'where' : 'which'
	const npxArgs = ['-y', '-p', `typescript@${version}`, locator, 'tsc']
	const output = process.platform === 'win32'
		? execFileSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'npx.cmd', ...npxArgs], { encoding: 'utf-8', env: { ...process.env } })
		: execFileSync('npx', npxArgs, { encoding: 'utf-8', env: { ...process.env } })
	const tscBin = output.split(/\r?\n/)
		.map(line => line.trim())
		.find(Boolean)!
	const typescriptRoot = resolve(dirname(tscBin), '..', 'typescript')
	return {
		tscPath: resolve(typescriptRoot, 'lib/tsc.js'),
		tsserverPath: resolve(typescriptRoot, 'lib/tsserver.js'),
	}
}

const enableTrace = args.trace ?? false
const enableTsserver = args.tsserver ?? false

interface TsVersionConfig {
	label: string
	tscPath: string
	tsserverPath: string
}

function buildTsVersionConfigs(): TsVersionConfig[] {
	const tsVersionsArg = args['ts-versions']
	if (!tsVersionsArg) {
		const tscPath = getDefaultTscPath()
		const tsserverPath = getDefaultTsserverPath()
		return [{ label: getTsVersion(tscPath), tscPath, tsserverPath }]
	}

	const versions = tsVersionsArg.split(',')
		.map(v => v.trim())
		.filter(Boolean)
	return versions.map((version) => {
		console.log(`Resolving TypeScript ${version}...`)
		const paths = resolveTsVersionPaths(version)
		const actualVersion = getTsVersion(paths.tscPath)
		return { label: actualVersion, ...paths }
	})
}

async function runBenchForVersion(tsConfig: TsVersionConfig): Promise<BenchSuite> {
	const scenarios = generateScenarios(config, dimensionFilter)
	const runners = ['tsc', ...(enableTrace ? ['trace'] : []), ...(enableTsserver ? ['tsserver'] : [])]

	console.log(`TypeScript ${tsConfig.label} — runners: ${runners.join(', ')}`)
	console.log(`Scenarios: ${scenarios.length} | Runs per scenario: ${config.runs}`)
	console.log('')

	const results: ScenarioResult[] = []

	for (let i = 0; i < scenarios.length; i++) {
		const scenario = scenarios[i]!
		const progress = `[${i + 1}/${scenarios.length}]`
		process.stdout.write(`${progress} ${scenario.name} ... `)

		let fixture: { dir: string, probePositions?: ProbePosition[] } | undefined
		try {
			fixture = await generateFixture(scenario.params, sourceRoot)

			const tsc = await runTscDiagnostics({
				fixtureDir: fixture.dir,
				tscPath: tsConfig.tscPath,
				runs: config.runs,
			})

			const trace = enableTrace
				? await runTrace({ fixtureDir: fixture.dir, tscPath: tsConfig.tscPath })
				: undefined

			const tsserver = (enableTsserver && fixture.probePositions && fixture.probePositions.length > 0)
				? await runTsserverLatency({
						fixtureDir: fixture.dir,
						probePositions: fixture.probePositions,
						tsserverPath: tsConfig.tsserverPath,
						runs: config.runs,
					})
				: undefined

			results.push({
				name: scenario.name,
				dimension: scenario.dimension,
				dimensionValue: scenario.params[scenario.dimension as keyof typeof scenario.params],
				params: scenario.params,
				tsc,
				trace,
				tsserver,
			})

			let line = `${tsc.instantiations.toLocaleString()} inst | ${tsc.checkTime.toFixed(2)}s | ${(tsc.memoryUsed / (1024 * 1024)).toFixed(1)}M`
			if (trace) {
				line += ` | trace: ${trace.totalEvents} events`
			}
			if (tsserver) {
				const avgP50 = tsserver.operations.length > 0
					? (tsserver.operations.reduce((s, o) => s + (o.p50 ?? o.latencyMs), 0) / tsserver.operations.length).toFixed(0)
					: '?'
				line += ` | tsserver avg p50: ${avgP50}ms`
			}
			console.log(line)
		}
		catch (error) {
			console.log(`FAILED: ${error instanceof Error ? error.message : error}`)
			throw error
		}
		finally {
			if (fixture) {
				await rm(fixture.dir, { recursive: true, force: true })
					.catch(() => {})
			}
		}
	}

	return {
		fixtureProfile: TYPE_BENCH_FIXTURE_PROFILE,
		timestamp: new Date()
			.toISOString(),
		tsVersion: tsConfig.label,
		runs: config.runs,
		results,
	}
}

async function main() {
	console.log('PikaCSS Type Bench')
	console.log('')

	const tsConfigs = buildTsVersionConfigs()
	const suites: BenchSuite[] = []

	for (const tsConfig of tsConfigs) {
		const suite = await runBenchForVersion(tsConfig)
		suites.push(suite)
		console.log('')
	}

	// Display results for each version
	for (const suite of suites) {
		const comparison = args.compare
			? compareDeterministicBaseline(await loadBaseline(args.compare), suite, args.compare)
			: undefined

		console.log(formatCliTable(suite, comparison))

		if (comparison && comparison.regressions.length > 0) {
			console.error(`\n❌ ${comparison.regressions.length} deterministic checker regression(s) detected vs baseline "${args.compare}"`)
			process.exitCode = 1
		}
	}

	// Save baseline if requested (uses the last suite)
	if (args['save-baseline']) {
		const lastSuite = suites.at(-1)!
		const filePath = await saveBaseline(args['save-baseline'], lastSuite)
		console.log(`\nBaseline saved to: ${filePath}`)
	}

	// Write JSON report (all suites if multi-version, single suite otherwise)
	if (args.output) {
		const outputPath = resolve(args.output)
		if (suites.length === 1) {
			await writeJsonReport(suites[0]!, outputPath)
		}
		else {
			await writeFile(outputPath, JSON.stringify(suites, null, 2), 'utf-8')
		}
		console.log(`\nJSON report written to: ${outputPath}`)
	}
}

main()
	.catch((error) => {
		console.error('Fatal error:', error)
		process.exit(1)
	})
