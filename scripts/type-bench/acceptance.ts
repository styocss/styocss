import type { BaselineComparison } from './baseline'
import type { BenchSuite } from './types'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { join, resolve } from 'pathe'
import {
	compareDeterministicBaseline,
	compareSameRunner,
	confirmedRegressionKeys,
	loadBaseline,
} from './baseline'
import { TYPE_BENCH_FIXTURE_PROFILE } from './config'

const DEFAULT_BASELINE = 'g1-project-typegen-v1'
const TIMING_DIMENSIONS = ['generatedMemberCount', 'entryCount', 'designTokensStrict', 'iconCount'] as const

const { values: args } = parseArgs({
	options: {
		'base-ref': { type: 'string' },
		'baseline': { type: 'string' },
		'runs': { type: 'string' },
		'force-same-runner': { type: 'boolean' },
		'skip-deterministic': { type: 'boolean' },
		'help': { type: 'boolean', short: 'h' },
	},
	strict: true,
})

if (args.help) {
	console.log(`
Usage: pnpm type-bench:acceptance [options]

Options:
  --base-ref <ref>          Git ref for same-runner base/head timing comparison
  --baseline <name>         Committed deterministic baseline (default: ${DEFAULT_BASELINE})
  --runs <n>                Runs per scenario/batch (default: 5)
  --force-same-runner       Run timing comparison even when base predates this fixture profile
  --skip-deterministic      Skip committed deterministic baseline validation
  -h, --help                Show this help
`)
	process.exit(0)
}

const repoRoot = resolve(import.meta.dirname, '../..')
const tsxPath = resolve(repoRoot, 'node_modules/.bin/tsx')
const benchmarkPath = resolve(repoRoot, 'scripts/type-bench/index.ts')
const runs = Number.parseInt(args.runs ?? '5', 10)
const baselineName = args.baseline ?? DEFAULT_BASELINE
const baseRef = args['base-ref'] ?? process.env.BASE_REF ?? 'origin/main'

async function main(): Promise<void> {
	console.log(`PikaCSS type/editor acceptance — ${runs} runs per scenario`)

	if (!args['skip-deterministic']) {
		const deterministic = await runSuite(repoRoot, undefined, false, 'head-deterministic')
		const committedBaseline = await loadBaseline(baselineName)
		const deterministicComparison = compareDeterministicBaseline(committedBaseline, deterministic, baselineName)
		printComparison(deterministicComparison)
		if (deterministicComparison.regressions.length > 0)
			throw new Error('Deterministic checker-complexity acceptance failed')
	}

	const baseCommit = git('merge-base', baseRef, 'HEAD')
		.trim()
	if (!args['force-same-runner'] && !baseDeclaresCurrentProfile(baseCommit)) {
		console.log(`Same-runner timing gate bootstrap: ${baseCommit.slice(0, 12)} predates fixture profile ${TYPE_BENCH_FIXTURE_PROFILE}; deterministic authority passed. Future PR bases with this profile will run base/head timing automatically.`)
		return
	}

	const baseWorktree = await mkdtemp(join(tmpdir(), 'pikacss-type-bench-base-'))
	try {
		git('worktree', 'add', '--detach', baseWorktree, baseCommit)
		prepareBaseWorktree(baseWorktree)

		const first = await runTimingBatch(baseWorktree, repoRoot, 'first')
		const firstKeys = first.flatMap(({ comparison }) => regressionKeys(comparison))
		if (firstKeys.length === 0) {
			console.log('Same-runner timing/editor acceptance passed without confirmation.')
			return
		}

		const regressedDimensions = [...new Set(first
			.filter(({ comparison }) => comparison.regressions.length > 0)
			.map(({ dimension }) => dimension))]
		console.log(`Timing guard band exceeded; running confirmation base/head batch for: ${regressedDimensions.join(', ')}`)
		const confirmation = await runTimingBatch(baseWorktree, repoRoot, 'confirmation', regressedDimensions)

		const confirmed = first.flatMap((firstEntry) => {
			const confirmedEntry = confirmation.find(entry => entry.dimension === firstEntry.dimension)
			return confirmedEntry == null
				? []
				: confirmedRegressionKeys(firstEntry.comparison, confirmedEntry.comparison)
		})
		if (confirmed.length > 0) {
			throw new Error(`Confirmed same-runner performance regressions:\n${confirmed.map(key => `  - ${key}`)
				.join('\n')}`)
		}
		console.log('Same-runner confirmation cleared the initial timing noise; acceptance passed.')
	}
	finally {
		try {
			git('worktree', 'remove', '--force', baseWorktree)
		}
		catch {}
		await rm(baseWorktree, { recursive: true, force: true })
	}
}

async function runTimingBatch(
	baseSourceRoot: string,
	headSourceRoot: string,
	label: string,
	dimensions: readonly string[] = TIMING_DIMENSIONS,
): Promise<Array<{ dimension: string, comparison: BaselineComparison }>> {
	const comparisons: Array<{ dimension: string, comparison: BaselineComparison }> = []
	for (const dimension of dimensions) {
		const baseline = await runSuite(baseSourceRoot, dimension, true, `${label}-base-${dimension}`)
		const current = await runSuite(headSourceRoot, dimension, true, `${label}-head-${dimension}`)
		const comparison = compareSameRunner(baseline, current, `${label}:${dimension}`)
		printComparison(comparison)
		comparisons.push({ dimension, comparison })
	}
	return comparisons
}

async function runSuite(sourceRoot: string, dimension: string | undefined, tsserver: boolean, label: string): Promise<BenchSuite> {
	const tempRoot = await mkdtemp(join(tmpdir(), 'pikacss-type-bench-suite-'))
	const outputPath = join(tempRoot, `${label}.json`)
	try {
		const commandArgs = [benchmarkPath, '--runs', String(runs), '--source-root', sourceRoot, '--output', outputPath]
		if (dimension != null)
			commandArgs.push('--dimension', dimension)
		if (tsserver)
			commandArgs.push('--tsserver')
		execFileSync(tsxPath, commandArgs, {
			cwd: repoRoot,
			stdio: 'inherit',
			env: process.env,
		})
		return JSON.parse(await readFile(outputPath, 'utf-8')) as BenchSuite
	}
	finally {
		await rm(tempRoot, { recursive: true, force: true })
	}
}

function baseDeclaresCurrentProfile(baseCommit: string): boolean {
	try {
		return git('show', `${baseCommit}:scripts/type-bench/config.ts`)
			.includes(TYPE_BENCH_FIXTURE_PROFILE)
	}
	catch {
		return false
	}
}

function prepareBaseWorktree(baseWorktree: string): void {
	const options = {
		cwd: baseWorktree,
		stdio: 'inherit' as const,
		env: { ...process.env, CI: '1' },
	}
	execFileSync('pnpm', ['install', '--frozen-lockfile', '--ignore-scripts'], options)
	execFileSync('pnpm', ['build'], options)
}

function git(...gitArgs: string[]): string {
	return execFileSync('git', gitArgs, {
		cwd: repoRoot,
		encoding: 'utf-8',
		maxBuffer: 64 * 1024 * 1024,
	})
}

function regressionKeys(comparison: BaselineComparison): string[] {
	return comparison.diffs.flatMap(diff => diff.metrics
		.filter(metric => metric.regression)
		.map(metric => `${diff.dimension}:${String(diff.dimensionValue)}:${metric.name}`))
}

function printComparison(comparison: BaselineComparison): void {
	const regressions = regressionKeys(comparison)
	const label = comparison.mode === 'deterministic' ? 'deterministic' : 'same-runner'
	if (regressions.length === 0) {
		console.log(`✓ ${label} ${comparison.baselineName}: no gated regressions`)
		return
	}
	console.log(`⚠ ${label} ${comparison.baselineName}:`)
	for (const key of regressions)
		console.log(`  - ${key}`)
}

main()
	.catch((error) => {
		console.error(error instanceof Error ? error.message : error)
		process.exit(1)
	})
