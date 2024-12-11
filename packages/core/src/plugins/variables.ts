import { appendAutocompleteExtraProperties, appendAutocompletePropertyValues } from '../config'
import { defineEnginePlugin } from '../plugin'
import type { Arrayable, Autocomplete, Properties } from '../types'

interface VariableAutocomplete<Autocomplete_ extends Autocomplete = Autocomplete> {
	asValueOf?: Arrayable<keyof Properties<Autocomplete_['ExtraProperties'], Autocomplete_['Properties']>>
	asProperty?: boolean
}

export type VariableConfig<Autocomplete_ extends Autocomplete = Autocomplete> =
	| `--${string}`
	| [name: `--${string}`, value?: string, autocomplete?: VariableAutocomplete<Autocomplete_>]
	| { name: `--${string}`, value?: string, autocomplete?: VariableAutocomplete<Autocomplete_> }

export interface ResolvedVariableConfig<Autocomplete_ extends Autocomplete = Autocomplete> {
	name: string
	value: string | null | undefined
	autocomplete: {
		asValueOf: (keyof Properties<Autocomplete_['ExtraProperties'], Autocomplete_['Properties']>)[]
		asProperty: boolean
	}
}

function resolveVariableConfig<Autocomplete_ extends Autocomplete = Autocomplete>(config: VariableConfig<Autocomplete_>): ResolvedVariableConfig<Autocomplete_> {
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

export function variables<Autocomplete_ extends Autocomplete = Autocomplete>(list: VariableConfig[]) {
	const allVariables: Map</* name */ string, /* css */ string> = new Map()
	return defineEnginePlugin<Autocomplete_>({
		name: 'core:variables',
		configResolved(resolvedConfig) {
			list.forEach((config) => {
				const { name, value, autocomplete: { asValueOf, asProperty } } = resolveVariableConfig(config)

				asValueOf.forEach(p => appendAutocompletePropertyValues<Autocomplete_>(resolvedConfig, p, `var(${name})`))

				if (asProperty)
					appendAutocompleteExtraProperties<Autocomplete_>(resolvedConfig, name)

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
