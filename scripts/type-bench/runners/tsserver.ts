import type { Buffer } from 'node:buffer'
import type { ProbePosition, TsserverLatencyReport, TsserverOperationResult } from '../types'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { resolve } from 'pathe'

interface TsserverRequest {
	seq: number
	type: 'request'
	command: string
	arguments: Record<string, unknown>
}

interface TsserverResponse {
	seq: number
	type: 'response'
	command: string
	request_seq: number
	success: boolean
	body?: unknown
}

export interface TsserverRunnerOptions {
	fixtureDir: string
	probePositions: ProbePosition[]
	tsserverPath?: string
	runs: number
}

export async function runTsserverLatency(options: TsserverRunnerOptions): Promise<TsserverLatencyReport> {
	const { fixtureDir, probePositions, runs } = options
	const tsserverPath = options.tsserverPath ?? findTsserverPath()

	if (probePositions.length === 0) {
		return { operations: [] }
	}

	const allResults: TsserverOperationResult[][] = []

	for (let run = 0; run < runs; run++) {
		const session = new TsserverSession(tsserverPath, fixtureDir)
		try {
			await session.start()

			// Open all files that have probes
			const files = [...new Set(probePositions.map(p => p.file))]
			for (const file of files) {
				await session.openFile(file)
			}

			// Wait for initial project loading
			await session.waitForDiagnostics(files[0]!)

			const runResults: TsserverOperationResult[] = []

			for (const probe of probePositions) {
				// completionInfo
				const completionTime = await session.measureRequest('completionInfo', {
					file: probe.file,
					line: probe.line,
					offset: probe.character,
					triggerKind: 1,
				})
				runResults.push({
					probeKind: probe.kind,
					operation: 'completionInfo',
					file: probe.file,
					line: probe.line,
					character: probe.character,
					latencyMs: completionTime,
				})

				// quickInfo
				const quickInfoTime = await session.measureRequest('quickinfo', {
					file: probe.file,
					line: probe.line,
					offset: probe.character,
				})
				runResults.push({
					probeKind: probe.kind,
					operation: 'quickInfo',
					file: probe.file,
					line: probe.line,
					character: probe.character,
					latencyMs: quickInfoTime,
				})

				// semanticDiagnosticsSync
				const diagTime = await session.measureRequest('semanticDiagnosticsSync', {
					file: probe.file,
				})
				runResults.push({
					probeKind: probe.kind,
					operation: 'semanticDiagnosticsSync',
					file: probe.file,
					line: probe.line,
					character: probe.character,
					latencyMs: diagTime,
				})
			}

			allResults.push(runResults)
		}
		finally {
			session.kill()
		}
	}

	// Aggregate across runs: compute p50 and p95
	return aggregateResults(allResults, probePositions)
}

function findTsserverPath(): string {
	const repoRoot = resolve(import.meta.dirname, '../../..')
	return resolve(repoRoot, 'node_modules/typescript/lib/tsserver.js')
}

function aggregateResults(allRuns: TsserverOperationResult[][], _probes: ProbePosition[]): TsserverLatencyReport {
	if (allRuns.length === 0)
		return { operations: [] }

	const opCount = allRuns[0]!.length
	const operations: TsserverOperationResult[] = []

	for (let i = 0; i < opCount; i++) {
		const latencies = allRuns.map(run => run[i]!.latencyMs)
			.sort((a, b) => a - b)
		const p50 = percentile(latencies, 50)
		const p95 = percentile(latencies, 95)
		const base = allRuns[0]![i]

		operations.push({
			...base,
			latencyMs: p50,
			p50,
			p95,
		} as TsserverOperationResult)
	}

	return { operations }
}

function percentile(sorted: number[], p: number): number {
	const index = (p / 100) * (sorted.length - 1)
	const lower = Math.floor(index)
	const upper = Math.ceil(index)
	if (lower === upper)
		return sorted[lower]!
	return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (index - lower)
}

class TsserverSession {
	private process: ReturnType<typeof spawn> | null = null
	private seq = 0
	private pendingRequests = new Map<number, { resolve: (response: TsserverResponse) => void, reject: (error: Error) => void }>()
	private buffer = ''

	constructor(
		private tsserverPath: string,
		private projectDir: string,
	) {}

	async start(): Promise<void> {
		this.process = spawn(process.execPath, [this.tsserverPath, '--disableAutomaticTypingAcquisition'], {
			cwd: this.projectDir,
			stdio: ['pipe', 'pipe', 'pipe'],
			env: { ...process.env, TSS_LOG: '' },
		})

		this.process.stdout!.on('data', (data: Buffer) => {
			this.buffer += data.toString()
			this.processBuffer()
		})

		this.process.stderr!.on('data', () => {
			// Ignore stderr
		})

		// Wait for tsserver to be ready
		await new Promise<void>((resolve) => {
			setTimeout(resolve, 500)
		})
	}

	private processBuffer(): void {
		const lines = this.buffer.split('\n')
		this.buffer = lines.pop() ?? ''

		for (const line of lines) {
			if (!line.startsWith('{'))
				continue
			try {
				const msg = JSON.parse(line)
				if (msg.type === 'response' && msg.request_seq != null) {
					const pending = this.pendingRequests.get(msg.request_seq)
					if (pending) {
						this.pendingRequests.delete(msg.request_seq)
						pending.resolve(msg)
					}
				}
			}
			catch {
				// Ignore non-JSON lines
			}
		}
	}

	async sendRequest(command: string, args: Record<string, unknown>): Promise<TsserverResponse> {
		if (!this.process)
			throw new Error('tsserver not started')

		const seq = ++this.seq
		const request: TsserverRequest = {
			seq,
			type: 'request',
			command,
			arguments: args,
		}

		return new Promise((resolve, reject) => {
			this.pendingRequests.set(seq, { resolve, reject })
			this.process!.stdin!.write(`${JSON.stringify(request)}\n`)

			// Timeout after 30s
			setTimeout(() => {
				if (this.pendingRequests.has(seq)) {
					this.pendingRequests.delete(seq)
					reject(new Error(`tsserver request timeout: ${command}`))
				}
			}, 30_000)
		})
	}

	async measureRequest(command: string, args: Record<string, unknown>): Promise<number> {
		const start = performance.now()
		await this.sendRequest(command, args)
		return performance.now() - start
	}

	async openFile(file: string): Promise<void> {
		await this.sendRequest('open', { file })
	}

	async waitForDiagnostics(file: string): Promise<void> {
		// Use semanticDiagnosticsSync to force project loading — it returns a real response
		await this.sendRequest('semanticDiagnosticsSync', { file })
			.catch(() => {})
	}

	kill(): void {
		if (this.process) {
			this.process.kill()
			this.process = null
		}
		for (const pending of this.pendingRequests.values()) {
			pending.reject(new Error('tsserver killed'))
		}
		this.pendingRequests.clear()
	}
}
