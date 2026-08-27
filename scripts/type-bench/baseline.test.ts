import type { BenchSuite, ScenarioResult, TsserverOperationResult } from './types'
import { describe, expect, it } from 'vitest'
import {
	compareDeterministicBaseline,
	compareSameRunner,
	confirmedRegressionKeys,
} from './baseline'

const params = {
	callCount: 50,
	pluginCount: 1,
	generatedMemberCount: 50,
	nestingDepth: 1,
	fileSpread: 'single' as const,
	entryCount: 1,
	designTokens: 0,
	designTokensStrict: 0,
	iconCount: 0,
}

function operation(operation: TsserverOperationResult['operation'], p50: number, p95: number): TsserverOperationResult {
	return {
		probeKind: 'property-value',
		operation,
		file: '/tmp/main.ts',
		line: 3,
		character: 10,
		latencyMs: p50,
		p50,
		p95,
	}
}

function result(overrides: Partial<ScenarioResult['tsc']> = {}, operations: TsserverOperationResult[] = []): ScenarioResult {
	return {
		name: 'generatedMemberCount=50',
		dimension: 'generatedMemberCount',
		dimensionValue: 50,
		params,
		tsc: {
			types: 100_000,
			instantiations: 200_000,
			memoryUsed: 200 * 1024 * 1024,
			checkTime: 1,
			...overrides,
		},
		tsserver: { operations },
	}
}

function suite(entry: ScenarioResult, overrides: Partial<BenchSuite> = {}): BenchSuite {
	return {
		fixtureProfile: 'project-typegen-v1',
		timestamp: '2026-08-27T00:00:00.000Z',
		tsVersion: '6.0.3',
		runs: 5,
		results: [entry],
		...overrides,
	}
}

describe('type-bench acceptance comparisons', () => {
	it('hard-gates deterministic checker complexity at more than 10% and ignores timing', () => {
		const baseline = suite(result())
		const current = suite(result({ types: 110_001, instantiations: 220_001, checkTime: 9, memoryUsed: 900 * 1024 * 1024 }))
		const comparison = compareDeterministicBaseline(baseline, current, 'baseline')
		expect(comparison.regressions)
			.toHaveLength(1)
		expect(comparison.regressions[0]!.metrics.filter(metric => metric.regression)
			.map(metric => metric.name))
			.toEqual(['types', 'instantiations'])
	})

	it('requires exact TypeScript version and fixture profile', () => {
		const baseline = suite(result())
		expect(() => compareDeterministicBaseline(baseline, suite(result(), { tsVersion: '6.1.0' }), 'baseline'))
			.toThrow(/TypeScript version mismatch/)
		expect(() => compareDeterministicBaseline(baseline, suite(result(), { fixtureProfile: 'other' }), 'baseline'))
			.toThrow(/fixture profile mismatch/)
	})

	it('requires both relative and absolute guard bands for same-runner timing metrics', () => {
		const baseline = suite(result())
		const belowAbsolute = suite(result({ checkTime: 1.09, memoryUsed: 240 * 1024 * 1024 }))
		expect(compareSameRunner(baseline, belowAbsolute, 'base').regressions)
			.toHaveLength(0)

		const regressed = suite(result({ checkTime: 1.21, memoryUsed: 241 * 1024 * 1024 }))
		const names = compareSameRunner(baseline, regressed, 'base').regressions[0]!.metrics
			.filter(metric => metric.regression)
			.map(metric => metric.name)
		expect(names)
			.toEqual(['memoryUsed', 'checkTime'])
	})

	it('hard-gates completion, quick-info, and semantic-diagnostics p50/p95', () => {
		const baseline = suite(result({}, [
			operation('completionInfo', 50, 100),
			operation('quickInfo', 50, 100),
			operation('semanticDiagnosticsSync', 50, 100),
		]))
		const current = suite(result({}, [
			operation('completionInfo', 80, 130),
			operation('quickInfo', 80, 130),
			operation('semanticDiagnosticsSync', 500, 800),
		]))
		const keys = compareSameRunner(baseline, current, 'base').regressions[0]!.metrics
			.filter(metric => metric.regression)
			.map(metric => metric.name)
		expect(keys)
			.toEqual([
				'tsserver.property-value.completionInfo.p50',
				'tsserver.property-value.completionInfo.p95',
				'tsserver.property-value.quickInfo.p50',
				'tsserver.property-value.quickInfo.p95',
				'tsserver.property-value.semanticDiagnosticsSync.p50',
				'tsserver.property-value.semanticDiagnosticsSync.p95',
			])
	})

	it('confirms only regressions that repeat in the second base/head batch', () => {
		const baseline = suite(result())
		const first = compareSameRunner(baseline, suite(result({ checkTime: 1.3, memoryUsed: 250 * 1024 * 1024 })), 'base')
		const confirmation = compareSameRunner(baseline, suite(result({ checkTime: 1.02, memoryUsed: 250 * 1024 * 1024 })), 'base-confirm')
		expect(confirmedRegressionKeys(first, confirmation))
			.toEqual(['generatedMemberCount:50:memoryUsed'])
	})
})
