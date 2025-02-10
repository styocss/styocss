import { appendAutocompleteCssPropertyValues, appendAutocompleteExtraCssProperties } from '../helpers'
import { defineEnginePlugin } from '../engine/plugin'
import type { VariableConfig } from './types'

interface ResolvedVariableConfig {
	name: string
	value: string | null | undefined
	autocomplete: {
		asValueOf: string[]
		asProperty: boolean
	}
}

function resolveVariableConfig(config: VariableConfig): ResolvedVariableConfig {
	if (typeof config === 'string')
		return { name: config, value: null, autocomplete: { asValueOf: ['*'], asProperty: true } }
	if (Array.isArray(config)) {
		const [name, value, { asValueOf = '*', asProperty = true } = {}] = config
		return { name, value, autocomplete: { asValueOf: [asValueOf].flat(), asProperty } }
	}
	const { name, value, autocomplete: { asValueOf = '*', asProperty = true } = {} } = config
	return { name, value, autocomplete: { asValueOf: [asValueOf].flat(), asProperty } }
}

const VAR_NAME_RE = /var\((--[^,)]+)(?:,[^)]+)?\)/g

function getNames(input: string): string[] {
	const matched = input.match(VAR_NAME_RE)
	if (!matched)
		return []

	return matched.map((match) => {
		const varNameMatch = match.match(/--[^,)]+/)
		return varNameMatch ? varNameMatch[0] : ''
	}).filter(Boolean)
}

function normalizeVariableName(name: string, prefix?: string) {
	if (name.startsWith('--'))
		return name
	if (prefix != null)
		return `--${prefix}-${name}`
	return `--${name}`
}

export function variables() {
	const allVariables: Map</* name */ string, /* css */ string> = new Map()
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
					allVariables.set(name, `${name}:${value}`)
			})
			resolvedConfig.preflights.push((engine) => {
				const used = new Set<string>()
				engine.store.atomicRules.forEach(({ content: { value } }) => {
					if (typeof value === 'string') {
						getNames(value).forEach(name => used.add(name))
					}
					else if (Array.isArray(value)) {
						value.forEach(v => getNames(v).forEach(name => used.add(name)))
					}
				})
				const content = Array.from(allVariables.entries())
					.filter(([name]) => used.has(name))
					.map(([, css]) => css)
					.join(';')
				return content === ''
					? ''
					: `:root{${content}}`
			})
		},
	})
}
