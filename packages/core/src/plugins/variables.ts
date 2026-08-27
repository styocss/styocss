import type { DiagnosticHandler } from '../diagnostics'
import type { Arrayable, InternalPropertyValue, PreflightDefinition, ResolvedCSSProperties, ResolvedSelector, UnionString } from '../types'
import { emitDiagnostic, noopDiagnosticHandler } from '../diagnostics'
import { defineEnginePlugin } from '../plugin'
import { renderTypegenJSDoc } from '../typegen/jsdoc'
import { isPlainObjectRecord, log } from '../utils'

type ResolvedCSSProperty = keyof ResolvedCSSProperties & string

/** Domain-local suggestion metadata for one CSS variable. */
export interface VariableSuggest {
	/** Whether the custom property itself is emitted as an explicit Typegen property symbol. @default true */
	asProperty?: boolean
	/** CSS properties for which `var(--name)` is suggested; `'*'` is an explicit wildcard. @default false */
	asValueOf?: Arrayable<'*' | ResolvedCSSProperty> | false
}

/** Local CSS variable leaf emitted and optionally pruned by PikaCSS. */
export interface LocalVariable {
	/** Value emitted for the custom property. */
	value: ResolvedCSSProperties[`--${string}`]
	/**
	 * Controls Typegen suggestions for this variable.
	 * @default `{ asProperty: true, asValueOf: false }`
	 */
	suggest?: VariableSuggest
	/**
	 * Documentation rendered for the generated Typegen variable member.
	 * @default `undefined`
	 */
	description?: string
	/**
	 * Whether this variable is removed when no generated style uses it.
	 * @default `VariablesConfig.pruneUnused`
	 */
	pruneUnused?: boolean
	/**
	 * Discriminator reserved for external variable definitions.
	 * @default `undefined`
	 */
	external?: never
}

/** External CSS variable leaf known to authoring but not emitted by PikaCSS. */
export interface ExternalVariable {
	/** Marks a variable as defined outside the generated stylesheet. */
	external: true
	/**
	 * Controls Typegen suggestions for this externally defined variable.
	 * @default `{ asProperty: true, asValueOf: false }`
	 */
	suggest?: VariableSuggest
	/**
	 * Documentation rendered for the generated Typegen variable member.
	 * @default `undefined`
	 */
	description?: string
	/**
	 * Discriminator excluding local variable definitions.
	 * @default `undefined`
	 */
	value?: never
	/**
	 * External variables are never pruned by PikaCSS.
	 * @default `undefined`
	 */
	pruneUnused?: never
}

/** Canonical object-only variable leaf. */
export type Variable = LocalVariable | ExternalVariable

/** CSS-like nested variable definition tree. Non-variable keys are selector scopes. */
export type VariablesDefinition = {
	[key in UnionString | ResolvedSelector]?: Variable | VariablesDefinition
}

/** Configuration for the built-in CSS variables subsystem. */
export interface VariablesConfig {
	/** Variable definition trees. Later entries override earlier entries at the same selector/name path. */
	definitions?: Arrayable<VariablesDefinition>
	/** Default pruning policy for local variables. @default true */
	pruneUnused?: boolean
	/** Variable names always emitted regardless of usage. */
	safeList?: (`--${string}` & {})[]
}

declare module '@pikacss/core' {
	interface EngineConfig {
		/** CSS variable definitions consumed once during Engine initialization. */
		variables?: VariablesConfig
	}

	interface Engine {
		/** Readonly semantic query of variable names referenced by current atomic styles, expanded transitively through configured variable values. */
		getUsedVariableNames: () => ReadonlySet<string>
	}
}

interface ResolvedVariable {
	name: string
	value?: InternalPropertyValue
	selector: string[]
	pruneUnused: boolean
	suggest: {
		asValueOf: string[]
		asProperty: boolean
	}
	description?: string
	external: boolean
}

interface VariablesState {
	definitions: VariablesDefinition[]
	defaultPruneUnused: boolean
	safeSet: Set<string>
	resolved: ResolvedVariable[]
	store: Map<string, ResolvedVariable[]>
}

function normalizeVariablesConfig(config?: VariablesConfig): VariablesDefinition[] {
	if (config == null)
		return []

	const merged: VariablesDefinition = {}
	if (config.definitions != null) {
		[config.definitions].flat()
			.forEach(definition => mergeVariablesDefinition(merged, definition))
	}
	return Object.keys(merged).length > 0 ? [merged] : []
}

function mergeVariablesDefinition(target: VariablesDefinition, source: VariablesDefinition): VariablesDefinition {
	for (const [key, value] of Object.entries(source)) {
		if (!key.startsWith('--') && isPlainObjectRecord(value) && isPlainObjectRecord(target[key as keyof VariablesDefinition])) {
			mergeVariablesDefinition(target[key as keyof VariablesDefinition] as VariablesDefinition, value as VariablesDefinition)
			continue
		}
		target[key as keyof VariablesDefinition] = value as Variable | VariablesDefinition
	}
	return target
}

function resolveSuggestTargets(asValueOf: VariableSuggest['asValueOf']): string[] {
	if (asValueOf === false || asValueOf == null)
		return []
	return [...new Set([asValueOf].flat()
		.map(String))]
}

function createResolveVariablesFn({
	pruneUnused: defaultPruneUnused = true,
	onDiagnostic = noopDiagnosticHandler,
}: {
	pruneUnused?: boolean
	onDiagnostic?: DiagnosticHandler
} = {}) {
	const warn = (code: string, message: string) => {
		if (onDiagnostic === noopDiagnosticHandler)
			log.warn(message)
		else
			emitDiagnostic(onDiagnostic, { level: 'warning', code, message })
	}

	function walk(variables: VariablesDefinition, levels: string[], result: ResolvedVariable[]): ResolvedVariable[] {
		for (const [key, value] of Object.entries(variables)) {
			if (key.startsWith('--')) {
				if (!isPlainObjectRecord(value) || (!('external' in value) && !('value' in value))) {
					warn('variables-invalid-leaf', `Invalid variable leaf for "${key}". Variable leaves must use the canonical object form. Skipping.`)
					continue
				}

				if ((value as Record<string, unknown>).external === true) {
					if (levels.length > 0) {
						warn('variables-scoped-external', `External variable "${key}" cannot be declared under selector scope "${levels.join(' -> ')}". Skipping.`)
						continue
					}
					result.push({
						name: key,
						selector: [':root'],
						pruneUnused: false,
						suggest: {
							asValueOf: resolveSuggestTargets((value.suggest as VariableSuggest | undefined)?.asValueOf),
							asProperty: (value.suggest as VariableSuggest | undefined)?.asProperty ?? true,
						},
						description: typeof value.description === 'string' ? value.description : undefined,
						external: true,
					})
					continue
				}

				const leaf = value as unknown as LocalVariable
				result.push({
					name: key,
					value: leaf.value as InternalPropertyValue,
					selector: levels.length > 0 ? levels : [':root'],
					pruneUnused: leaf.pruneUnused ?? defaultPruneUnused,
					suggest: {
						asValueOf: resolveSuggestTargets(leaf.suggest?.asValueOf),
						asProperty: leaf.suggest?.asProperty ?? true,
					},
					description: leaf.description,
					external: false,
				})
				continue
			}

			if (!isPlainObjectRecord(value)) {
				warn('variables-invalid-scope', `Invalid variables scope for selector "${key}". Expected a nested object, received ${typeof value}. Skipping.`)
				continue
			}
			walk(value as VariablesDefinition, [...levels, key], result)
		}
		return result
	}

	return (variables: VariablesDefinition): ResolvedVariable[] => walk(variables, [], [])
}

function compareStrings(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0
}

function groupVariablesByName(resolved: readonly ResolvedVariable[]): Map<string, ResolvedVariable[]> {
	const groups = new Map<string, ResolvedVariable[]>()
	for (const variable of resolved) {
		const list = groups.get(variable.name) ?? []
		list.push(variable)
		groups.set(variable.name, list)
	}
	return groups
}

function renderVariablePreview(name: string, entries: readonly ResolvedVariable[]): string | undefined {
	const emitted = entries.filter(entry => !entry.external && entry.value != null)
	if (emitted.length === 0)
		return undefined
	const lines: string[] = []
	for (const entry of emitted) {
		entry.selector.forEach((selector, depth) => {
			lines.push(`${'  '.repeat(depth)}${selector} {`)
		})
		const values = Array.isArray(entry.value)
			? [...entry.value[1].map(String), String(entry.value[0])]
			: [String(entry.value)]
		const propertyIndent = '  '.repeat(entry.selector.length)
		for (const value of values)
			lines.push(`${propertyIndent}${name}: ${value};`)
		for (let depth = entry.selector.length - 1; depth >= 0; depth--)
			lines.push(`${'  '.repeat(depth)}}`)
	}
	return lines.join('\n')
}

function renderVariableDeclarations(resolved: readonly ResolvedVariable[]): string {
	const groups = groupVariablesByName(resolved)
	const orderedNames = [...groups.keys()].sort(compareStrings)
	const lines = ['interface __PikaVariables {']
	for (const name of orderedNames) {
		const entries = groups.get(name)!
		const descriptions = [...new Set(entries.flatMap(entry => entry.description == null ? [] : [entry.description]))].sort(compareStrings)
		const reference = `var(${name})`
		lines.push(...renderTypegenJSDoc({
			description: [...descriptions, `CSS variable reference: ${reference}`].join('\n\n'),
			previewCss: renderVariablePreview(name, entries),
		}, {}, '  '))
		lines.push(`  ${JSON.stringify(name)}: ${JSON.stringify(reference)}`)
	}
	lines.push('}')

	lines.push('interface __PikaVariableProperties {')
	for (const name of orderedNames) {
		const entries = groups.get(name)!
		if (!entries.some(entry => entry.suggest.asProperty))
			continue
		const descriptions = [...new Set(entries.flatMap(entry => entry.description == null ? [] : [entry.description]))].sort(compareStrings)
		lines.push(...renderTypegenJSDoc({ description: descriptions.join('\n\n') || undefined }, {}, '  '))
		lines.push(`  ${JSON.stringify(name)}?: string | [value: string, fallback: string[]] | null | undefined`)
	}
	lines.push('}')

	const valuesByTarget = new Map<string, Set<string>>()
	for (const [name, entries] of groups) {
		const reference = `var(${name})`
		for (const target of entries.flatMap(entry => entry.suggest.asValueOf)) {
			const values = valuesByTarget.get(target) ?? new Set<string>()
			values.add(reference)
			valuesByTarget.set(target, values)
		}
	}
	lines.push('interface __PikaVariablePropertyValues {')
	for (const target of [...valuesByTarget.keys()].sort(compareStrings)) {
		const values = [...valuesByTarget.get(target)!].sort(compareStrings)
			.map(value => JSON.stringify(value))
		lines.push(`  ${JSON.stringify(target)}: ${values.join(' | ')}`)
	}
	lines.push('}')
	return lines.join('\n')
}

function collectAtomicVariableUsage(
	engine: { store: { atomicStyles: Map<string, { content: { value: string[] } }> } },
	usedAtomicStyleIds?: ReadonlySet<string>,
): Set<string> {
	const used = new Set<string>()
	engine.store.atomicStyles.forEach(({ content: { value } }, id) => {
		if (usedAtomicStyleIds != null && usedAtomicStyleIds.has(id) === false)
			return
		value.flatMap(extractUsedVarNames)
			.map(normalizeVariableName)
			.forEach(name => used.add(name))
	})
	return used
}

function expandVariableUsage(used: Set<string>, store: ReadonlyMap<string, readonly ResolvedVariable[]>): Set<string> {
	const queue = Array.from(used)
	while (queue.length > 0) {
		const name = queue.pop()!
		const entries = store.get(name)
		if (entries == null)
			continue
		for (const { value } of entries) {
			const referencedValue = Array.isArray(value) ? value.join(' ') : String(value)
			for (const refName of extractUsedVarNames(referencedValue)
				.map(normalizeVariableName)) {
				if (used.has(refName))
					continue
				used.add(refName)
				queue.push(refName)
			}
		}
	}
	return used
}

/** Built-in CSS variable subsystem with config-only semantic ingress. */
export function variables() {
	return defineEnginePlugin({
		name: 'core:variables',
		createState: (): VariablesState => ({
			definitions: [],
			defaultPruneUnused: true,
			safeSet: new Set(),
			resolved: [],
			store: new Map(),
		}),
		rawConfigConfigured(config, context) {
			context.state.definitions = normalizeVariablesConfig(config.variables)
			context.state.defaultPruneUnused = config.variables?.pruneUnused ?? true
			context.state.safeSet = new Set(config.variables?.safeList ?? [])
		},
		configureEngine(configurator) {
			const engine = configurator.runtime
			const resolveVariables = createResolveVariablesFn({
				pruneUnused: configurator.state.defaultPruneUnused,
				onDiagnostic: configurator.onDiagnostic,
			})
			const resolved = configurator.state.definitions.flatMap(resolveVariables)
			configurator.state.resolved = resolved
			configurator.state.store.clear()
			for (const variable of resolved) {
				if (variable.external || variable.value == null)
					continue
				const list = configurator.state.store.get(variable.name) ?? []
				list.push(variable)
				configurator.state.store.set(variable.name, list)
			}

			const groups = groupVariablesByName(resolved)
			const namespace = Object.freeze(Object.fromEntries(
				[...groups.keys()].sort(compareStrings)
					.map(name => [name, `var(${name})`]),
			))
			configurator.pika.extendStatic('var', namespace)
			configurator.typegen.add({
				id: 'core:variables',
				declarations: renderVariableDeclarations(resolved),
				pika: { var: '__PikaVariables' },
				cssProperties: '__PikaVariableProperties',
				cssPropertyValues: '__PikaVariablePropertyValues',
			})

			const state = configurator.state
			engine.getUsedVariableNames = () => new Set(expandVariableUsage(collectAtomicVariableUsage(engine), state.store))
			engine.addPreflight({
				id: 'core:variables',
				preflight: async (engine, isFormatted, ctx) => {
					const used = collectAtomicVariableUsage(engine, ctx?.usedAtomicStyleIds)

					const otherPreflights = engine.config.preflights.filter(p => p.id !== 'core:variables')
					const preflightResults = await Promise.all(
						otherPreflights.map(({ fn }) => engine.invokePreflight(fn, isFormatted, ctx)
							.catch(() => null)),
					)
					preflightResults.forEach((result) => {
						if (result == null)
							return
						extractUsedVarNamesFromPreflightResult(result)
							.forEach(name => used.add(name))
					})

					const varMap = state.store
					for (const [name, entries] of varMap.entries()) {
						if (used.has(name))
							continue
						if (state.safeSet.has(name) || entries.some(entry => entry.pruneUnused === false))
							used.add(name)
					}

					expandVariableUsage(used, varMap)

					const usedVariables = Array.from(varMap.values())
						.flat()
						.filter(({ name, pruneUnused, value }) => (state.safeSet.has(name) || pruneUnused === false || used.has(name)) && value != null)
					const preflightDefinition: PreflightDefinition = {}
					for (const { name, value, selector: rawSelector } of usedVariables) {
						const selector = await engine.pluginHooks.transformSelectors(engine.config.plugins, rawSelector)
						let current = preflightDefinition
						for (const item of selector) {
							current[item] ||= {}
							current = current[item] as PreflightDefinition
						}
						Object.assign(current, { [name]: value })
					}
					return preflightDefinition
				},
			})
		},
	})
}

const VAR_NAME_RE = /var\(\s*(--[\w-]+)/g

/**
 * Extracts all CSS variable names referenced via `var(--*)` calls in a string.
 *
 * @param input - The CSS value string to scan.
 * @returns An array of variable names (including the `--` prefix) found in `var()` expressions.
 *
 * @remarks Uses a global regex to find all `var(--name)` occurrences. Nested `var()` calls are matched independently.
 *
 * @example
 * ```ts
 * extractUsedVarNames('color: var(--primary)')  // ['--primary']
 * extractUsedVarNames('var(--a) var(--b)')       // ['--a', '--b']
 * ```
 */
export function extractUsedVarNames(input: string): string[] {
	return Array.from(input.matchAll(VAR_NAME_RE), m => m[1]!)
}

/**
 * Ensures a variable name has the `--` prefix.
 *
 * @param name - The variable name, with or without the `--` prefix.
 * @returns The name with a guaranteed `--` prefix.
 *
 * @remarks A no-op when the name already starts with `--`.
 *
 * @example
 * ```ts
 * normalizeVariableName('color')     // '--color'
 * normalizeVariableName('--color')   // '--color'
 * ```
 */
export function normalizeVariableName(name: string) {
	if (name.startsWith('--'))
		return name
	return `--${name}`
}

/**
 * Recursively extracts all CSS variable names referenced in a preflight result.
 *
 * @param result - A preflight output: either a raw CSS string or a nested `PreflightDefinition` object.
 * @returns A flat array of normalized variable names found in the result.
 *
 * @remarks For string results, scans for `var(--*)` references. For object results, recursively traverses selector scopes and string/number values. All returned names are normalized with the `--` prefix.
 *
 * @example
 * ```ts
 * extractUsedVarNamesFromPreflightResult({ ':root': { color: 'var(--primary)' } })
 * // ['--primary']
 * ```
 */
export function extractUsedVarNamesFromPreflightResult(
	result: string | PreflightDefinition,
): string[] {
	if (typeof result === 'string') {
		return extractUsedVarNames(result)
			.map(normalizeVariableName)
	}
	const names: string[] = []
	for (const value of Object.values(result)) {
		if (value == null)
			continue
		if (typeof value === 'string' || typeof value === 'number') {
			extractUsedVarNames(String(value))
				.forEach(n => names.push(normalizeVariableName(n)))
			continue
		}
		extractUsedVarNamesFromPreflightResult(value as PreflightDefinition)
			.forEach(n => names.push(n))
	}
	return names
}
