import type { TscDiagnostics } from '../types'
import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface TscRunnerOptions {
	fixtureDir: string
	tscPath?: string
	runs: number
}

export async function runTscDiagnostics(options: TscRunnerOptions): Promise<TscDiagnostics> {
	const { fixtureDir, runs } = options
	const tscPath = options.tscPath ?? findTscPath()

	const results: TscDiagnostics[] = []

	for (let i = 0; i < runs; i++) {
		const result = await runOnce(tscPath, fixtureDir)
		results.push(result)
	}

	return medianResult(results)
}

function findTscPath(): string {
	// Resolve tsc from the monorepo's node_modules
	const repoRoot = resolve(import.meta.dirname, '../../..')
	const localTsc = resolve(repoRoot, 'node_modules/.bin/tsc')
	return localTsc
}

async function runOnce(tscPath: string, cwd: string): Promise<TscDiagnostics> {
	try {
		const { stdout, stderr } = await execFileAsync(
			tscPath,
			['--noEmit', '--diagnostics'],
			{ cwd, timeout: 120_000 },
		)
		return parseDiagnosticsOutput(stdout + stderr)
	}
	catch (error: any) {
		if (error.stdout || error.stderr) {
			const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim()
			throw new Error(`Type-bench fixture failed TypeScript validation:\n${output}`)
		}
		throw error
	}
}

function parseDiagnosticsOutput(output: string): TscDiagnostics {
	const lines = output.split('\n')

	let types = 0
	let instantiations = 0
	let memoryUsed = 0
	let checkTime = 0

	for (const line of lines) {
		const trimmed = line.trim()

		const typesMatch = trimmed.match(/^Types:\s+([\d,]+)/)
		if (typesMatch) {
			types = Number.parseInt(typesMatch[1]!.replace(/,/g, ''), 10)
			continue
		}

		const instMatch = trimmed.match(/^Instantiations:\s+([\d,]+)/)
		if (instMatch) {
			instantiations = Number.parseInt(instMatch[1]!.replace(/,/g, ''), 10)
			continue
		}

		const memMatch = trimmed.match(/^Memory used:\s+([\d,]+)K/)
		if (memMatch) {
			memoryUsed = Number.parseInt(memMatch[1]!.replace(/,/g, ''), 10) * 1024
			continue
		}

		const checkMatch = trimmed.match(/^Check time:\s+([\d.]+)s/)
		if (checkMatch) {
			checkTime = Number.parseFloat(checkMatch[1]!)
			continue
		}
	}

	return { types, instantiations, memoryUsed, checkTime }
}

function medianResult(results: TscDiagnostics[]): TscDiagnostics {
	const sorted = (arr: number[]) => [...arr].sort((a, b) => a - b)
	const median = (arr: number[]) => {
		const s = sorted(arr)
		const mid = Math.floor(s.length / 2)
		return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!
	}

	return {
		types: median(results.map(r => r.types)),
		instantiations: median(results.map(r => r.instantiations)),
		memoryUsed: median(results.map(r => r.memoryUsed)),
		checkTime: median(results.map(r => r.checkTime)),
	}
}
