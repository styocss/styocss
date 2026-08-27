export type FileSpread = 'single' | '10files' | '50files'

export interface ScenarioParams {
	callCount: number
	pluginCount: number
	generatedMemberCount: number
	nestingDepth: number
	fileSpread: FileSpread
	/** Number of isolated Engine snapshots composed into one project Typegen document. */
	entryCount: number
	/** Number of design tokens registered via @pikacss/plugin-design-tokens (0 = plugin not registered). */
	designTokens: number
	/** Number of design tokens registered with `strict.types` enabled (0 = plugin not registered). */
	designTokensStrict: number
	/** Number of concrete inline icon members finalized through the real Icons rich-Typegen pipeline. */
	iconCount: number
}

export interface TscDiagnostics {
	types: number
	instantiations: number
	memoryUsed: number // bytes
	checkTime: number // seconds
}

export interface ScenarioResult {
	name: string
	dimension: string
	dimensionValue: number | string
	params: ScenarioParams
	tsc: TscDiagnostics
	trace?: TraceSummary
	tsserver?: TsserverLatencyReport
}

export interface TraceSummary {
	hotTypes: Array<{ name: string, totalTime: number, count: number }>
	totalCheckTime: number
	totalEvents: number
}

export interface TraceEvent {
	ph: string
	name: string
	dur?: number
	args?: Record<string, any>
}

export interface BenchSuite {
	fixtureProfile: string
	timestamp: string
	tsVersion: string
	runs: number
	results: ScenarioResult[]
}

export interface FixtureProject {
	dir: string
	probePositions?: ProbePosition[]
}

export interface ProbePosition {
	file: string
	line: number
	character: number
	kind: 'property-value' | 'shortcut-string' | 'selector-key' | 'hover'
}

export interface TsserverOperationResult {
	probeKind: ProbePosition['kind']
	operation: 'completionInfo' | 'quickInfo' | 'completionEntryDetails' | 'semanticDiagnosticsSync'
	file: string
	line: number
	character: number
	latencyMs: number
	p50?: number
	p95?: number
}

export interface TsserverLatencyReport {
	operations: TsserverOperationResult[]
}
