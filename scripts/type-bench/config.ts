import type { FileSpread, ScenarioParams } from './types'

export const TYPE_BENCH_FIXTURE_PROFILE = 'project-typegen-v1'

export interface DimensionScale<T = number | string> {
	values: T[]
	baseline: T
}

export interface BenchConfig {
	dimensions: {
		callCount: DimensionScale<number>
		pluginCount: DimensionScale<number>
		generatedMemberCount: DimensionScale<number>
		nestingDepth: DimensionScale<number>
		fileSpread: DimensionScale<FileSpread>
		entryCount: DimensionScale<number>
		designTokens: DimensionScale<number>
		designTokensStrict: DimensionScale<number>
		iconCount: DimensionScale<number>
	}
	runs: number
}

export const defaultConfig: BenchConfig = {
	dimensions: {
		callCount: {
			values: [10, 50, 200, 500, 1000],
			baseline: 50,
		},
		pluginCount: {
			values: [0, 1, 3, 5],
			baseline: 1,
		},
		generatedMemberCount: {
			values: [10, 50, 200],
			baseline: 50,
		},
		nestingDepth: {
			values: [1, 2, 3, 4],
			baseline: 1,
		},
		fileSpread: {
			values: ['single', '10files', '50files'],
			baseline: 'single',
		},
		entryCount: {
			values: [1, 2, 4],
			baseline: 1,
		},
		// Number of design tokens registered via @pikacss/plugin-design-tokens.
		// Baseline is 0 so the plugin is not registered in other dimensions' scenarios,
		// keeping their type cost unchanged.
		designTokens: {
			values: [100, 500, 1000],
			baseline: 0,
		},
		// Same fixtures as `designTokens`, but with `strict.types` enabled so the
		// generated pika.gen.ts carries the per-property exclusive value unions and
		// the intersected item type. Isolates the type cost of strict-type narrowing.
		// Baseline 0 keeps the plugin unregistered in other dimensions' scenarios.
		designTokensStrict: {
			values: [100, 500, 1000],
			baseline: 0,
		},
		iconCount: {
			values: [50, 200, 500],
			baseline: 0,
		},
	},
	runs: 5,
}

export function getBaselineParams(config: BenchConfig): ScenarioParams {
	return {
		callCount: config.dimensions.callCount.baseline,
		pluginCount: config.dimensions.pluginCount.baseline,
		generatedMemberCount: config.dimensions.generatedMemberCount.baseline,
		nestingDepth: config.dimensions.nestingDepth.baseline,
		fileSpread: config.dimensions.fileSpread.baseline as FileSpread,
		entryCount: config.dimensions.entryCount.baseline,
		designTokens: config.dimensions.designTokens.baseline,
		designTokensStrict: config.dimensions.designTokensStrict.baseline,
		iconCount: config.dimensions.iconCount.baseline,
	}
}

export type DimensionName = keyof BenchConfig['dimensions']

export function generateScenarios(config: BenchConfig, dimensionFilter?: DimensionName): Array<{ name: string, dimension: string, params: ScenarioParams }> {
	const baseline = getBaselineParams(config)
	const scenarios: Array<{ name: string, dimension: string, params: ScenarioParams }> = []

	for (const [dimName, dimScale] of Object.entries(config.dimensions)) {
		if (dimensionFilter && dimName !== dimensionFilter)
			continue

		for (const value of dimScale.values) {
			const params = { ...baseline, [dimName]: value }
			const name = `${dimName}=${value}`
			scenarios.push({ name, dimension: dimName, params })
		}
	}

	return scenarios
}
