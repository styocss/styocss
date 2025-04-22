import type { StyleDefinition } from '../types'
import { defineEnginePlugin } from '../plugin'
import { appendAutocompleteExtraProperties, appendAutocompletePropertyValues, isPropertyValue } from '../utils'

export function important() {
	let _default: boolean
	return defineEnginePlugin({
		name: 'core:important',

		beforeConfigResolving(config) {
			_default = config.important?.default ?? false
		},
		configResolved(resolvedConfig) {
			appendAutocompleteExtraProperties(resolvedConfig, '__important')
			appendAutocompletePropertyValues(resolvedConfig, '__important', 'boolean')
		},
		transformStyleDefinitions(styleDefinitions) {
			return styleDefinitions.map<StyleDefinition>((styleDefinition) => {
				const { __important, ...rest } = styleDefinition
				const theImportant = __important as boolean | undefined
				const important = theImportant == null ? _default : theImportant

				if (important === false)
					return rest

				return Object.fromEntries(
					Object.entries(rest)
						.map(([k, v]) => {
							if (isPropertyValue(v) === false || v == null)
								return [k, v]

							const modified = [v].flat(2).map(v => `${v} !important`)

							return [k, modified]
						}),
				)
			})
		},
	})
}
