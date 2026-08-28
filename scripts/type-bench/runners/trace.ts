import type { TraceEvent, TraceSummary } from '../types'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface TraceRunnerOptions {
	fixtureDir: string
	tscPath?: string
	topN?: number
}

export async function runTrace(options: TraceRunnerOptions): Promise<TraceSummary> {
	const { fixtureDir, topN = 15 } = options
	const tscPath = options.tscPath ?? findTscPath()
	const traceDir = await mkdtemp(join(tmpdir(), 'pikacss-trace-'))

	try {
		await execFileAsync(
			process.execPath,
			[tscPath, '--noEmit', '--generateTrace', traceDir],
			{ cwd: fixtureDir, timeout: 120_000 },
		)
			.catch(() => {
			// tsc may exit with errors but still produce trace
			})

		const traceContent = await readFile(join(traceDir, 'trace.json'), 'utf-8')
			.catch(() => null)
		const typesContent = await readFile(join(traceDir, 'types.json'), 'utf-8')
			.catch(() => null)

		if (!traceContent) {
			return { hotTypes: [], totalCheckTime: 0, totalEvents: 0 }
		}

		const events: TraceEvent[] = JSON.parse(traceContent)
		const types: Array<{ id: number, display?: string }> = typesContent ? JSON.parse(typesContent) : []

		return analyzeTrace(events, types, topN)
	}
	finally {
		await rm(traceDir, { recursive: true, force: true })
			.catch(() => {})
	}
}

function findTscPath(): string {
	const repoRoot = resolve(import.meta.dirname, '../../..')
	return resolve(repoRoot, 'node_modules/typescript/lib/tsc.js')
}

function analyzeTrace(events: TraceEvent[], types: Array<{ id: number, display?: string }>, topN: number): TraceSummary {
	const typeDisplayMap = new Map<number, string>()
	for (const t of types) {
		if (t.display) {
			typeDisplayMap.set(t.id, t.display)
		}
	}

	// Collect duration events (ph: 'X' = complete events)
	const hotMap = new Map<string, { totalTime: number, count: number }>()
	let totalCheckTime = 0
	let totalEvents = 0

	for (const event of events) {
		if (event.ph !== 'X' || !event.dur)
			continue

		totalEvents++
		const durMs = event.dur / 1000 // trace times are in microseconds

		// Track check time
		if (event.name === 'check')
			totalCheckTime += durMs

		// Categorize by event name + type info
		const category = categorizeEvent(event, typeDisplayMap)
		if (category) {
			const existing = hotMap.get(category) ?? { totalTime: 0, count: 0 }
			existing.totalTime += durMs
			existing.count++
			hotMap.set(category, existing)
		}
	}

	const hotTypes = Array.from(hotMap.entries(), ([name, stats]) => ({ name, totalTime: Math.round(stats.totalTime * 100) / 100, count: stats.count }))
		.sort((a, b) => b.totalTime - a.totalTime)
		.slice(0, topN)

	return { hotTypes, totalCheckTime: Math.round(totalCheckTime * 100) / 100, totalEvents }
}

function categorizeEvent(event: TraceEvent, typeDisplayMap: Map<number, string>): string | null {
	const name = event.name

	// Focus on type checking events
	const relevantEvents = [
		'checkExpression',
		'checkSourceFile',
		'structuredTypeRelatedTo',
		'getTypeOfExpression',
		'isRelatedTo',
		'checkVariableDeclaration',
		'resolveCall',
		'assignmentCompatibleWith',
		'getContextualType',
		'checkObjectLiteral',
	]

	if (!relevantEvents.includes(name))
		return null

	// Try to extract type information from args
	const args = event.args
	if (!args)
		return name

	// Check for type IDs in args
	const sourceId = args.sourceId ?? args.id
	const targetId = args.targetId

	if (sourceId && typeDisplayMap.has(sourceId)) {
		const display = typeDisplayMap.get(sourceId)!
		const shortName = shortenTypeName(display)
		return `${name}: ${shortName}`
	}

	if (targetId && typeDisplayMap.has(targetId)) {
		const display = typeDisplayMap.get(targetId)!
		const shortName = shortenTypeName(display)
		return `${name} → ${shortName}`
	}

	return name
}

function shortenTypeName(display: string): string {
	// Truncate long type names for readability
	if (display.length > 80) {
		return `${display.slice(0, 77)}...`
	}
	return display
}
