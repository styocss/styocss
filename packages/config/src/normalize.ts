import type { EngineConfig } from '@pikacss/core'
import type {
	DefinedPikaConfig,
	ReportConfig,
	ResolvedProjectConfig,
	ResolvedProjectEntry,
	ResolvedReportConfig,
	ResolvedScanConfig,
	ScanConfig,
	SingleProjectConfig,
} from './types'
import { readTransport } from './transport'

export const DEFAULT_SCAN_INCLUDE = Object.freeze(['**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,vue}'])
export const DEFAULT_SCAN_EXCLUDE = Object.freeze(['node_modules/**', 'dist/**', '.git/**', '.nuxt/**', '.output/**', 'coverage/**'])

const RESERVED_BINDINGS = new Set([
	'arguments',
	'await',
	'break',
	'case',
	'catch',
	'class',
	'const',
	'continue',
	'debugger',
	'default',
	'delete',
	'do',
	'else',
	'enum',
	'eval',
	'export',
	'extends',
	'false',
	'finally',
	'for',
	'function',
	'if',
	'implements',
	'import',
	'in',
	'instanceof',
	'interface',
	'let',
	'new',
	'null',
	'package',
	'private',
	'protected',
	'public',
	'return',
	'static',
	'super',
	'switch',
	'this',
	'throw',
	'true',
	'try',
	'typeof',
	'var',
	'void',
	'while',
	'with',
	'yield',
	'undefined',
	'NaN',
	'Infinity',
])

const IDENTIFIER_RE = /^[$_\p{ID_Start}][$\p{ID_Continue}\u200C\u200D]*$/u
const URI_SCHEME_RE = /^[a-z][a-z\d+.-]*:/i

/** Host-supplied config-relative filesystem resolver. */
export interface ProjectPathResolver {
	readonly resolvePath: (value: string) => string
	readonly resolvePattern: (value: string) => string
}

function fail(path: string, reason: string): never {
	throw new Error(`[pikacss/config] Invalid ${path}: ${reason}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value != null && typeof value === 'object' && !Array.isArray(value)
}

function assertKnownKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
	const allowedSet = new Set(allowed)
	for (const key of Object.keys(value)) {
		if (!allowedSet.has(key))
			fail(`${path}.${key}`, 'unknown configuration key')
	}
}

function requireNonEmptyString(value: unknown, path: string): string {
	if (typeof value !== 'string')
		fail(path, 'expected a string')
	if (value.length === 0 || value.trim().length === 0)
		fail(path, 'must not be empty')
	return value
}

function normalizeFnName(value: unknown, path: string): string {
	const name = requireNonEmptyString(value, path)
	if (!IDENTIFIER_RE.test(name) || RESERVED_BINDINGS.has(name))
		fail(path, `"${name}" is not a valid ECMAScript/TypeScript value-binding identifier`)
	return name
}

function normalizeCssModule(value: unknown, path: string): string {
	const specifier = requireNonEmptyString(value, path)
	if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.includes('\\') || specifier.includes('?') || specifier.includes('#'))
		fail(path, 'must be a bare logical module specifier')
	if (URI_SCHEME_RE.test(specifier) || /\s/u.test(specifier))
		fail(path, 'must be a bare logical module specifier')
	const segments = specifier.split('/')
	if (segments.some(segment => segment.length === 0 || segment === '.' || segment === '..'))
		fail(path, 'must not contain empty, ".", or ".." path segments')
	if (specifier.startsWith('@') && segments.length < 2)
		fail(path, 'scoped module specifiers require a package segment')
	return specifier
}

function normalizePatternList(value: unknown, defaults: readonly string[], path: string, resolver: ProjectPathResolver): readonly string[] {
	const input = value === undefined ? defaults : typeof value === 'string' ? [value] : value
	if (!Array.isArray(input))
		fail(path, 'expected a string or array of strings')
	const output = input.map((pattern, index) => {
		const normalized = requireNonEmptyString(pattern, `${path}[${index}]`)
		return resolver.resolvePattern(normalized)
	})
	return Object.freeze(output)
}

function normalizeScan(value: unknown, path: string, resolver: ProjectPathResolver): ResolvedScanConfig {
	if (value === undefined) {
		return Object.freeze({
			include: normalizePatternList(undefined, DEFAULT_SCAN_INCLUDE, `${path}.include`, resolver),
			exclude: normalizePatternList(undefined, DEFAULT_SCAN_EXCLUDE, `${path}.exclude`, resolver),
		})
	}
	if (!isRecord(value))
		fail(path, 'expected an object')
	assertKnownKeys(value, ['include', 'exclude'], path)
	return Object.freeze({
		include: normalizePatternList(value.include, DEFAULT_SCAN_INCLUDE, `${path}.include`, resolver),
		exclude: normalizePatternList(value.exclude, DEFAULT_SCAN_EXCLUDE, `${path}.exclude`, resolver),
	})
}

function normalizeReport(value: unknown, path: string, resolver: ProjectPathResolver): ResolvedReportConfig {
	if (value === undefined || value === false)
		return false
	if (value === true)
		return Object.freeze({})
	if (!isRecord(value))
		fail(path, 'expected false, true, or { output: string }')
	assertKnownKeys(value, ['output'], path)
	const output = requireNonEmptyString(value.output, `${path}.output`)
	return Object.freeze({ output: resolver.resolvePath(output) })
}

function normalizeEngine(value: unknown, path: string): EngineConfig {
	if (value === undefined)
		return {}
	if (!isRecord(value))
		fail(path, 'expected an EngineConfig object')
	return value as EngineConfig
}

function normalizeEntry(raw: Record<string, unknown>, path: string, resolver: ProjectPathResolver, explicitMulti: boolean): ResolvedProjectEntry {
	const allowed = ['engine', 'fnName', 'cssModule', 'transformedFormat', 'scan', 'report']
	if (!explicitMulti)
		allowed.push('stateDir')
	assertKnownKeys(raw, allowed, path)

	const fnName = raw.fnName === undefined && !explicitMulti
		? 'pika'
		: normalizeFnName(raw.fnName, `${path}.fnName`)
	const cssModule = raw.cssModule === undefined && !explicitMulti
		? 'pika.css'
		: normalizeCssModule(raw.cssModule, `${path}.cssModule`)
	const transformedFormat = raw.transformedFormat === undefined ? 'string' : raw.transformedFormat
	if (transformedFormat !== 'string' && transformedFormat !== 'array')
		fail(`${path}.transformedFormat`, 'expected "string" or "array"')

	return Object.freeze({
		engine: normalizeEngine(raw.engine, `${path}.engine`),
		fnName,
		cssModule,
		transformedFormat,
		scan: normalizeScan(raw.scan as ScanConfig | undefined, `${path}.scan`, resolver),
		report: normalizeReport(raw.report as ReportConfig | undefined, `${path}.report`, resolver),
	})
}

function normalizeStateDir(value: unknown, path: string, resolver: ProjectPathResolver): string {
	const stateDir = value === undefined ? '.pikacss' : requireNonEmptyString(value, path)
	return resolver.resolvePath(stateDir)
}

/**
 * Normalizes one opaque defineConfig transport exactly once.
 *
 * @internal
 */
export function normalizeDefinedConfig(value: DefinedPikaConfig | unknown, resolver: ProjectPathResolver): ResolvedProjectConfig {
	const transport = readTransport(value)
	if (transport == null)
		fail('default export', 'expected the opaque value returned by defineConfig()')

	if (transport.authoringForm === 'single') {
		if (!isRecord(transport.config))
			fail('config', 'expected an object')
		const entry = normalizeEntry(transport.config as Record<string, unknown>, 'config', resolver, false)
		return Object.freeze({
			authoringForm: 'single',
			stateDir: normalizeStateDir((transport.config as SingleProjectConfig).stateDir, 'config.stateDir', resolver),
			entries: Object.freeze([entry]),
		})
	}

	if (!Array.isArray(transport.entries) || transport.entries.length === 0)
		fail('entries', 'explicit multi-entry config must contain at least one entry')
	if (!isRecord(transport.options))
		fail('project options', 'expected an object')
	assertKnownKeys(transport.options as Record<string, unknown>, ['stateDir'], 'project options')

	const entries = transport.entries.map((entry, index) => {
		if (!isRecord(entry))
			fail(`entries[${index}]`, 'expected an object')
		return normalizeEntry(entry, `entries[${index}]`, resolver, true)
	})

	const fnNames = new Set<string>()
	const cssModules = new Set<string>()
	const reportOutputs = new Set<string>()
	for (const [index, entry] of entries.entries()) {
		if (fnNames.has(entry.fnName))
			fail(`entries[${index}].fnName`, `duplicate configured root "${entry.fnName}"`)
		fnNames.add(entry.fnName)
		if (cssModules.has(entry.cssModule))
			fail(`entries[${index}].cssModule`, `duplicate logical module "${entry.cssModule}"`)
		cssModules.add(entry.cssModule)
		if (entry.report !== false && entry.report.output != null) {
			if (reportOutputs.has(entry.report.output))
				fail(`entries[${index}].report.output`, `duplicate resolved report output "${entry.report.output}"`)
			reportOutputs.add(entry.report.output)
		}
	}

	return Object.freeze({
		authoringForm: 'multi',
		stateDir: normalizeStateDir(transport.options.stateDir, 'project options.stateDir', resolver),
		entries: Object.freeze(entries),
	})
}
