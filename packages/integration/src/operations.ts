import type { Diagnostic, DiagnosticHandler } from '@pikacss/core'
import type { GeneratedStatePublicationResult } from './generatedState'
import { access, readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { isAbsolute, join, relative, resolve } from 'pathe'
import { publishGeneratedState } from './generatedState'
import { createProjectRuntime } from './projectRuntime'

export interface PikaCSSHostContext {
	/** Directly installed public package root referenced by generated TypeScript. */
	readonly publicEntryModule: string
	/** Host/framework state directory default used only when config omits stateDir. */
	readonly defaultStateDir?: string
	/** Optional host-specific Markdown href projection for materialized previews. */
	readonly previewHref?: (absolutePath: string) => string
}

export interface PreparePikaCSSOptions {
	readonly cwd?: string
	readonly config?: string
	readonly host: PikaCSSHostContext
	readonly onDiagnostic?: DiagnosticHandler
}

export interface PreparePikaCSSResult {
	readonly projectRoot: string
	readonly selectedConfigPath: string | null
	readonly stateDir: string
	readonly declarationPath: string
	readonly previewPaths: readonly string[]
	/** Non-fatal diagnostics emitted while deriving/materializing the successful publication. */
	readonly diagnostics: readonly Diagnostic[]
	readonly entries: readonly Readonly<{
		fnName: string
		cssModule: string
	}>[]
}

/**
 * Deterministically derives one project generation and publishes only its
 * canonical generated TypeScript state. It never scans application sources,
 * emits runtime CSS, starts watchers, or produces build reports.
 */
export async function preparePikaCSS(options: PreparePikaCSSOptions): Promise<PreparePikaCSSResult> {
	const projectRoot = resolve(options.cwd ?? process.cwd())
	const defaultStateDir = options.host.defaultStateDir == null
		? undefined
		: (isAbsolute(options.host.defaultStateDir)
				? options.host.defaultStateDir
				: resolve(projectRoot, options.host.defaultStateDir))
	const diagnostics: Diagnostic[] = []
	const onDiagnostic: DiagnosticHandler = (diagnostic) => {
		diagnostics.push(diagnostic)
		options.onDiagnostic?.(diagnostic)
	}
	let publication!: GeneratedStatePublicationResult
	const runtime = createProjectRuntime({
		projectRoot,
		...(options.config == null ? {} : { config: options.config }),
		...(defaultStateDir == null ? {} : { defaultStateDir }),
		mode: 'oneshot',
		onDiagnostic,
		async publishActivation(candidate, context) {
			publication = await publishGeneratedState(candidate, {
				host: {
					publicEntryModule: options.host.publicEntryModule,
					...(options.host.previewHref == null ? {} : { previewHref: options.host.previewHref }),
				},
				onDiagnostic,
				isCurrent: context.isCurrent,
			})
		},
	})

	await runtime.requestReload()
	const generation = await runtime.captureGeneration()
	const committed = publication
	return Object.freeze({
		projectRoot,
		selectedConfigPath: generation.selectedConfigPath,
		stateDir: generation.config.stateDir,
		declarationPath: committed.declarationPath,
		previewPaths: committed.previewPaths,
		diagnostics: Object.freeze([...diagnostics]),
		entries: Object.freeze(generation.entries.map(entry => Object.freeze({
			fnName: entry.config.fnName,
			cssModule: entry.config.cssModule,
		}))),
	})
}

const SUPPORTED_CONFIG_NAMES = Object.freeze([
	'pika.config.ts',
	'pika.config.mts',
	'pika.config.cts',
	'pika.config.js',
	'pika.config.mjs',
	'pika.config.cjs',
])

interface PackageJsonShape {
	readonly type?: unknown
	readonly dependencies?: Readonly<Record<string, unknown>>
	readonly devDependencies?: Readonly<Record<string, unknown>>
}

async function fileExists(path: string): Promise<boolean> {
	try {
		await access(path)
		return true
	}
	catch {
		return false
	}
}

async function readPackageJson(projectRoot: string): Promise<PackageJsonShape | null> {
	try {
		return JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8')) as PackageJsonShape
	}
	catch {
		return null
	}
}

async function detectProjectLanguage(projectRoot: string, packageJson: PackageJsonShape | null): Promise<'typescript' | 'javascript'> {
	if (await fileExists(join(projectRoot, 'tsconfig.json')))
		return 'typescript'
	if (packageJson?.dependencies?.typescript != null || packageJson?.devDependencies?.typescript != null)
		return 'typescript'
	return 'javascript'
}

function configName(language: 'typescript' | 'javascript', moduleMode: 'esm' | 'commonjs'): string {
	if (language === 'typescript')
		return moduleMode === 'esm' ? 'pika.config.mts' : 'pika.config.ts'
	return moduleMode === 'esm' ? 'pika.config.mjs' : 'pika.config.js'
}

function configSource(publicEntryModule: string, language: 'typescript' | 'javascript', moduleMode: 'esm' | 'commonjs'): string {
	if (language === 'javascript' && moduleMode === 'commonjs') {
		return [
			`const { defineConfig } = require(${JSON.stringify(publicEntryModule)})`,
			'',
			'module.exports = defineConfig({})',
			'',
		].join('\n')
	}
	return [
		`import { defineConfig } from ${JSON.stringify(publicEntryModule)}`,
		'',
		'export default defineConfig({})',
		'',
	].join('\n')
}

export interface InitPikaCSSOptions {
	readonly cwd?: string
	readonly host: PikaCSSHostContext
}

export interface InitPikaCSSResult {
	readonly projectRoot: string
	readonly configPath: string
	readonly created: boolean
	readonly language: 'typescript' | 'javascript'
	readonly moduleMode: 'esm' | 'commonjs'
	readonly stateDir: string
	readonly declarationPath: string
	/** Project config file preferred for including generated Typegen. */
	readonly typeProjectFile: 'tsconfig.json' | 'jsconfig.json'
	/** Project-root-relative generated-state path suitable for ignore/include guidance. */
	readonly generatedStatePath: string
}

/**
 * Conservatively scaffolds one canonical PikaCSS config and returns structured
 * follow-up facts. No other project file is modified.
 */
export async function initPikaCSS(options: InitPikaCSSOptions): Promise<InitPikaCSSResult> {
	const projectRoot = resolve(options.cwd ?? process.cwd())
	const existing = (await Promise.all(SUPPORTED_CONFIG_NAMES.map(async name => ({
		path: join(projectRoot, name),
		exists: await fileExists(join(projectRoot, name)),
	}))))
		.find(({ exists }) => exists)
	const packageJson = await readPackageJson(projectRoot)
	const language = await detectProjectLanguage(projectRoot, packageJson)
	const moduleMode = packageJson?.type === 'module' ? 'esm' : 'commonjs'
	const target = existing?.path ?? join(projectRoot, configName(language, moduleMode))
	let created = false

	if (existing == null) {
		try {
			await writeFile(target, configSource(options.host.publicEntryModule, language, moduleMode), { flag: 'wx' })
			created = true
		}
		catch (error: any) {
			if (error?.code !== 'EEXIST')
				throw error
		}
	}

	const stateDir = options.host.defaultStateDir == null
		? join(projectRoot, '.pikacss')
		: (isAbsolute(options.host.defaultStateDir)
				? options.host.defaultStateDir
				: resolve(projectRoot, options.host.defaultStateDir))
	const generatedStatePath = relative(projectRoot, stateDir) || '.'
	return Object.freeze({
		projectRoot,
		configPath: target,
		created,
		language,
		moduleMode,
		stateDir,
		declarationPath: join(stateDir, 'pika.gen.ts'),
		typeProjectFile: language === 'typescript' ? 'tsconfig.json' : 'jsconfig.json',
		generatedStatePath,
	})
}
