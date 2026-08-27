import type { Diagnostic } from '@pikacss/unplugin-pikacss'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { initPikaCSS, preparePikaCSS } from '@pikacss/unplugin-pikacss'

const PUBLIC_ENTRY_MODULE = '@pikacss/nuxt-pikacss'

export interface CliIO {
	stdout: (text: string) => void
	stderr: (text: string) => void
}

const defaultIO: CliIO = {
	stdout: text => process.stdout.write(text),
	stderr: text => process.stderr.write(text),
}

function usage(): string {
	return [
		'Usage:',
		'  pikacss init [--cwd <dir>]',
		'  pikacss prepare [--cwd <dir>] [--config <file>]',
		'  pikacss --help',
		'',
	].join('\n')
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

function formatDiagnostic(diagnostic: Diagnostic): string {
	const source = diagnostic.plugin == null ? '' : `[${diagnostic.plugin}] `
	return `${diagnostic.level} ${source}${diagnostic.code}: ${diagnostic.message}`
}

/** Thin Nuxt-owned CLI wrapper over Integration-owned init/prepare operations. */
export async function runCli(args: readonly string[], io: CliIO = defaultIO): Promise<number> {
	try {
		const { values, positionals } = parseArgs({
			args: [...args],
			allowPositionals: true,
			strict: true,
			options: {
				cwd: { type: 'string' },
				config: { type: 'string' },
				help: { type: 'boolean', short: 'h' },
			},
		})

		const [command, ...extraPositionals] = positionals
		if (values.help === true || command === 'help') {
			io.stdout(usage())
			return 0
		}
		if (extraPositionals.length > 0)
			throw new Error(`Unexpected argument: ${extraPositionals[0]}`)

		if (command === 'init') {
			if (values.config != null)
				throw new Error('`--config` is only supported by `pikacss prepare`.')
			const result = await initPikaCSS({
				...(values.cwd == null ? {} : { cwd: values.cwd }),
				host: { publicEntryModule: PUBLIC_ENTRY_MODULE },
			})
			io.stdout(`${result.created ? 'Created' : 'Using existing'} PikaCSS config: ${result.configPath}\n`)
			io.stdout(`Generated declaration: ${result.declarationPath}\n`)
			io.stdout(`Add ${result.generatedStatePath}/pika.gen.ts to ${result.typeProjectFile} so editor/typecheck tooling can load generated authoring types.\n`)
			io.stdout('Run `pikacss prepare` for PikaCSS-only generated state; `nuxt prepare` remains the full Nuxt framework preparation lifecycle.\n')
			return 0
		}

		if (command === 'prepare') {
			const result = await preparePikaCSS({
				...(values.cwd == null ? {} : { cwd: values.cwd }),
				...(values.config == null ? {} : { config: values.config }),
				host: { publicEntryModule: PUBLIC_ENTRY_MODULE },
			})
			for (const diagnostic of result.diagnostics)
				io.stderr(`${formatDiagnostic(diagnostic)}\n`)
			io.stdout(`Prepared PikaCSS generated state: ${result.declarationPath}\n`)
			io.stdout('`pikacss prepare` prepares PikaCSS state only; `nuxt prepare` remains the broader Nuxt framework lifecycle.\n')
			return 0
		}

		throw new Error(command == null ? 'Missing command.' : `Unknown command: ${command}`)
	}
	catch (error) {
		io.stderr(`PikaCSS: ${errorMessage(error)}\n`)
		return 1
	}
}
