import type { Arrayable, Nullish, ResolvedCSSProperty, UnionString } from '../types'
import { defineEnginePlugin } from '../plugin'
import { renderCSSStyleBlocks } from '../utils'

export interface VariableAutocomplete {
	/**
	 * Specify the properties that the variable can be used as a value of.
	 *
	 * @default ['*']
	 */
	asValueOf?: Arrayable<UnionString | '*' | '-' | ResolvedCSSProperty>
	/**
	 * Whether to add the variable as a CSS property.
	 *
	 * @default true
	 */
	asProperty?: boolean
}

export type VariableConfig =
	| string
	| [name: string, value?: string, autocomplete?: VariableAutocomplete, pruneUnused?: boolean]
	| { name: string, value?: string, autocomplete?: VariableAutocomplete, pruneUnused?: boolean }

declare module '@pikacss/core' {
	interface EngineConfig {
		variables?: {
			/**
			 * Define CSS variables with support for static values and autocomplete configuration.
			 *
			 * @default []
			 * @example
			 * ```ts
			 * {
			 *   variables: [
			 *     // Basic usage
			 *     ['primary', '#ff0000'],
			 *     // With autocomplete configuration
			 *     ['accent', '#00ff00', {
			 *       asValueOf: ['color', 'background-color'],
			 *       asProperty: true
			 *     }]
			 *   ]
			 * }
			 * ```
			 */
			variables: VariableConfig[]

			/**
			 * Whether to prune unused variables from the final CSS.
			 *
			 * @default true
			 */
			pruneUnused?: boolean
		}
	}

	interface EngineExtraProperties {
		variables: {
			store: Map<string, ResolvedVariableConfig>
			add: (...list: VariableConfig[]) => void
		}
	}
}

export function variables() {
	let resolveVariableConfig: (config: VariableConfig) => ResolvedVariableConfig
	let configList: VariableConfig[]
	return defineEnginePlugin({
		name: 'core:variables',

		rawConfigConfigured(config) {
			resolveVariableConfig = createResolveConfigFn({
				pruneUnused: config.variables?.pruneUnused,
			})
			configList = config.variables?.variables ?? []
		},
		configureEngine(engine) {
			engine.extra.variables = {
				store: new Map(),
				add: (...list) => {
					list.forEach((config) => {
						const resolved = resolveVariableConfig(config)
						const { name: _name, value, autocomplete: { asValueOf, asProperty } } = resolved
						const name = normalizeVariableName(_name)

						asValueOf.forEach((p) => {
							if (p !== '-')
								engine.appendAutocompleteCssPropertyValues(p, `var(${name})`)
						})

						if (asProperty)
							engine.appendAutocompleteExtraCssProperties(name)

						if (value != null)
							engine.extra.variables.store.set(name, resolved)
					})
					engine.notifyPreflightUpdated()
				},
			}

			engine.extra.variables.add(...configList)

			engine.addPreflight((engine, isFormatted) => {
				const used = new Set<string>()
				engine.store.atomicStyles.forEach(({ content: { value } }) => {
					value.flatMap(extractUsedVarNames)
						.forEach(name => used.add(normalizeVariableName(name)))
				})
				return renderCSSStyleBlocks(
					new Map([[
						':root',
						{
							properties: Array.from(engine.extra.variables.store.entries())
								.filter(([name, { value }]) => used.has(name) && value != null)
								.map(([name, { value }]) => ({ property: name, value: value! })),
						},
					]]),
					isFormatted,
				)
			})
		},
	})
}

interface ResolvedVariableConfig {
	name: string
	value: string | Nullish
	pruneUnused: boolean
	autocomplete: {
		asValueOf: string[]
		asProperty: boolean
	}
}

function createResolveConfigFn({
	pruneUnused: defaultPruneUnused = true,
}: {
	pruneUnused?: boolean
} = {}) {
	return function resolveVariableConfig(config: VariableConfig): ResolvedVariableConfig {
		if (typeof config === 'string')
			return { name: config, value: null, autocomplete: { asValueOf: ['*'], asProperty: true }, pruneUnused: defaultPruneUnused }
		if (Array.isArray(config)) {
			const [name, value, { asValueOf = '*', asProperty = true } = {}, pruneUnused = defaultPruneUnused] = config
			return { name, value, autocomplete: { asValueOf: [asValueOf].flat(), asProperty }, pruneUnused }
		}
		const { name, value, autocomplete: { asValueOf = '*', asProperty = true } = {}, pruneUnused = defaultPruneUnused } = config
		return { name, value, autocomplete: { asValueOf: [asValueOf].flat(), asProperty }, pruneUnused }
	}
}

const VAR_NAME_RE = /var\((--[\w-]+)/g

export function extractUsedVarNames(input: string): string[] {
	const matched = input.match(VAR_NAME_RE)
	if (!matched)
		return []

	return matched.map((match) => {
		const varNameMatch = match.match(/--[^,)]+/)
		return varNameMatch ? varNameMatch[0] : ''
	}).filter(Boolean)
}

export function normalizeVariableName(name: string) {
	if (name.startsWith('--'))
		return name
	return `--${name}`
}
