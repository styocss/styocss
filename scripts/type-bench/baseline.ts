import type { BenchSuite, ScenarioResult, TsserverOperationResult } from './types'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'pathe'

const BASELINES_DIR = resolve(import.meta.dirname, 'baselines')
const DETERMINISTIC_THRESHOLD_PERCENT = 10
const TIMING_THRESHOLD_PERCENT = 20
const CHECK_TIME_ABSOLUTE_SECONDS = 0.1
const MEMORY_ABSOLUTE_BYTES = 32 * 1024 * 1024
const TSSERVER_ABSOLUTE_MS = 25
const HARD_GATED_TSSERVER_OPERATIONS = new Set<TsserverOperationResult['operation']>(['completionInfo', 'quickInfo', 'semanticDiagnosticsSync'])

export function baselinePath(name: string): string {
	return resolve(BASELINES_DIR, `${name}.json`)
}

export async function saveBaseline(name: string, suite: BenchSuite): Promise<string> {
	const filePath = baselinePath(name)
	await mkdir(dirname(filePath), { recursive: true })
	await writeFile(filePath, JSON.stringify(suite, null, 2), 'utf-8')
	return filePath
}

export async function loadBaseline(name: string): Promise<BenchSuite> {
	const filePath = baselinePath(name)
	const raw = await readFile(filePath, 'utf-8')
	return JSON.parse(raw) as BenchSuite
}

export type ComparisonMode = 'deterministic' | 'same-runner'

export interface BaselineDiff {
	scenario: string
	dimension: string
	dimensionValue: number | string
	metrics: MetricDiff[]
}

export interface MetricDiff {
	name: string
	baseline: number
	current: number
	change: number
	changePercent: number
	thresholdPercent: number
	thresholdAbsolute: number
	regression: boolean
}

export interface BaselineComparison {
	mode: ComparisonMode
	baselineName: string
	baselineTs: string
	currentTs: string
	fixtureProfile: string
	diffs: BaselineDiff[]
	regressions: BaselineDiff[]
}

export function compareDeterministicBaseline(
	baseline: BenchSuite,
	current: BenchSuite,
	baselineName: string,
): BaselineComparison {
	assertComparableSuites(baseline, current)
	const diffs = compareScenarios(baseline, current, result => [
		diffMetric('types', result.baseline.tsc.types, result.current.tsc.types, DETERMINISTIC_THRESHOLD_PERCENT, 0),
		diffMetric('instantiations', result.baseline.tsc.instantiations, result.current.tsc.instantiations, DETERMINISTIC_THRESHOLD_PERCENT, 0),
	])
	return comparison('deterministic', baselineName, baseline, current, diffs)
}

export function compareSameRunner(
	baseline: BenchSuite,
	current: BenchSuite,
	baselineName: string,
): BaselineComparison {
	assertComparableSuites(baseline, current)
	const diffs = compareScenarios(baseline, current, (result) => {
		const metrics = [
			diffMetric('memoryUsed', result.baseline.tsc.memoryUsed, result.current.tsc.memoryUsed, TIMING_THRESHOLD_PERCENT, MEMORY_ABSOLUTE_BYTES),
			diffMetric('checkTime', result.baseline.tsc.checkTime, result.current.tsc.checkTime, TIMING_THRESHOLD_PERCENT, CHECK_TIME_ABSOLUTE_SECONDS),
		]
		metrics.push(...compareTsserver(result.baseline, result.current))
		return metrics
	})
	return comparison('same-runner', baselineName, baseline, current, diffs)
}

export function confirmedRegressionKeys(
	first: BaselineComparison,
	confirmation: BaselineComparison,
): string[] {
	if (first.mode !== 'same-runner' || confirmation.mode !== 'same-runner')
		throw new Error('Confirmation is only valid for same-runner comparisons')
	const firstKeys = new Set(regressionKeys(first))
	return regressionKeys(confirmation)
		.filter(key => firstKeys.has(key))
}

export function regressionKeys(comparison: BaselineComparison): string[] {
	return comparison.diffs.flatMap(diff => diff.metrics
		.filter(metric => metric.regression)
		.map(metric => `${diff.dimension}:${String(diff.dimensionValue)}:${metric.name}`))
}

export function assertComparableSuites(baseline: BenchSuite, current: BenchSuite): void {
	if (!baseline.fixtureProfile || !current.fixtureProfile) {
		throw new Error('Type-bench suite is missing fixtureProfile; legacy baselines are trend-only and cannot be acceptance authorities')
	}
	if (baseline.fixtureProfile !== current.fixtureProfile) {
		throw new Error(`Type-bench fixture profile mismatch: ${baseline.fixtureProfile} != ${current.fixtureProfile}`)
	}
	if (baseline.tsVersion !== current.tsVersion) {
		throw new Error(`TypeScript version mismatch: ${baseline.tsVersion} != ${current.tsVersion}`)
	}
	const baselineKeys = scenarioKeys(baseline)
	const currentKeys = scenarioKeys(current)
	if (baselineKeys.join('\n') !== currentKeys.join('\n')) {
		throw new Error(`Type-bench scenario set mismatch:\nbaseline: ${baselineKeys.join(', ')}\ncurrent: ${currentKeys.join(', ')}`)
	}
}

function scenarioKeys(suite: BenchSuite): string[] {
	return suite.results.map(result => `${result.dimension}:${String(result.dimensionValue)}`)
		.sort()
}

function compareScenarios(
	baseline: BenchSuite,
	current: BenchSuite,
	metricsFor: (result: { baseline: ScenarioResult, current: ScenarioResult }) => MetricDiff[],
): BaselineDiff[] {
	return current.results.map((currentResult) => {
		const baseResult = baseline.results.find(
			candidate => candidate.dimension === currentResult.dimension
				&& String(candidate.dimensionValue) === String(currentResult.dimensionValue),
		)!
		return {
			scenario: currentResult.name,
			dimension: currentResult.dimension,
			dimensionValue: currentResult.dimensionValue,
			metrics: metricsFor({ baseline: baseResult, current: currentResult }),
		}
	})
}

function compareTsserver(baseline: ScenarioResult, current: ScenarioResult): MetricDiff[] {
	const baseOps = baseline.tsserver?.operations ?? []
	const currentOps = current.tsserver?.operations ?? []
	if (baseOps.length === 0 && currentOps.length === 0)
		return []

	const metrics: MetricDiff[] = []
	for (const currentOp of currentOps) {
		if (!HARD_GATED_TSSERVER_OPERATIONS.has(currentOp.operation))
			continue
		const baseOp = baseOps.find(op => operationKey(op) === operationKey(currentOp))
		if (!baseOp)
			throw new Error(`Missing baseline tsserver operation ${operationKey(currentOp)} in ${current.name}`)
		for (const percentile of ['p50', 'p95'] as const) {
			const baselineValue = baseOp[percentile] ?? baseOp.latencyMs
			const currentValue = currentOp[percentile] ?? currentOp.latencyMs
			metrics.push(diffMetric(
				`tsserver.${currentOp.probeKind}.${currentOp.operation}.${percentile}`,
				baselineValue,
				currentValue,
				TIMING_THRESHOLD_PERCENT,
				TSSERVER_ABSOLUTE_MS,
			))
		}
	}
	return metrics
}

function operationKey(operation: TsserverOperationResult): string {
	return `${operation.probeKind}:${operation.operation}:${operation.line}:${operation.character}`
}

function comparison(
	mode: ComparisonMode,
	baselineName: string,
	baseline: BenchSuite,
	current: BenchSuite,
	diffs: BaselineDiff[],
): BaselineComparison {
	return {
		mode,
		baselineName,
		baselineTs: baseline.tsVersion,
		currentTs: current.tsVersion,
		fixtureProfile: current.fixtureProfile,
		diffs,
		regressions: diffs.filter(diff => diff.metrics.some(metric => metric.regression)),
	}
}

function diffMetric(
	name: string,
	baseline: number,
	current: number,
	thresholdPercent: number,
	thresholdAbsolute: number,
): MetricDiff {
	const change = current - baseline
	const changePercent = baseline !== 0 ? (change / baseline) * 100 : (change > 0 ? Number.POSITIVE_INFINITY : 0)
	return {
		name,
		baseline,
		current,
		change,
		changePercent,
		thresholdPercent,
		thresholdAbsolute,
		regression: changePercent > thresholdPercent && change > thresholdAbsolute,
	}
}
