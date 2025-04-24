import type { VariableConfig } from '../types'
import { defineEnginePlugin } from '../plugin'
import { appendAutocompleteCssPropertyValues, appendAutocompleteExtraCssProperties, renderCSSStyleBlocks } from '../utils'

interface ResolvedVariableConfig {
	name: string
	value: string | null | undefined
	autocomplete: {
		asValueOf: string[]
		asProperty: boolean
	}
}

export function resolveVariableConfig(config: VariableConfig): ResolvedVariableConfig {
	if (typeof config === 'string')
		return { name: config, value: null, autocomplete: { asValueOf: ['*'], asProperty: true } }
	if (Array.isArray(config)) {
		const [name, value, { asValueOf = '*', asProperty = true } = {}] = config
		return { name, value, autocomplete: { asValueOf: [asValueOf].flat(), asProperty } }
	}
	const { name, value, autocomplete: { asValueOf = '*', asProperty = true } = {} } = config
	return { name, value, autocomplete: { asValueOf: [asValueOf].flat(), asProperty } }
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

export function normalizeVariableName(name: string, prefix?: string) {
	if (name.startsWith('--'))
		return name
	if (prefix)
		return `--${prefix}-${name}`
	return `--${name}`
}

export function variables() {
	const allVariables: Map</* name */ string, /* value */ string> = new Map()
	let prefix: string | undefined
	let configList: VariableConfig[]
	return defineEnginePlugin({
		name: 'core:variables',

		beforeConfigResolving(config) {
			prefix = config.variablesPrefix
			configList = config.variables ?? []
		},
		configResolved(resolvedConfig) {
			configList.forEach((config) => {
				const { name: _name, value, autocomplete: { asValueOf, asProperty } } = resolveVariableConfig(config)
				const name = normalizeVariableName(_name, prefix)

				asValueOf.forEach(p => appendAutocompleteCssPropertyValues(resolvedConfig, p, `var(${name})`))

				if (asProperty)
					appendAutocompleteExtraCssProperties(resolvedConfig, name)

				if (value != null)
					allVariables.set(name, value)
			})
			resolvedConfig.preflights.push((engine, isFormatted) => {
				const used = new Set<string>()
				engine.store.atomicStyles.forEach(({ content: { value } }) => {
					value
						.flatMap(extractUsedVarNames)
						.forEach(name => used.add(normalizeVariableName(name)))
				})
				return renderCSSStyleBlocks(
					new Map([[
						':root',
						{
							properties: Array.from(allVariables.entries())
								.filter(([name]) => used.has(name))
								.map(([name, value]) => ({ property: name, value })),
						},
					]]),
					isFormatted,
				)
			})
		},
	})
}
