import type { Nullish, StyleDefinition } from '../types'
import { defineEnginePlugin } from '../plugin'
import { isPropertyValue } from '../utils'

// #region ImportantConfig
interface ImportantConfig {
	default?: boolean
}
// #endregion ImportantConfig

declare module '@pikacss/core' {
	interface EngineConfig {
		important?: ImportantConfig
	}
}

export function important() {
	let defaultValue: boolean
	return defineEnginePlugin({
		name: 'core:important',

		rawConfigConfigured(config) {
			defaultValue = config.important?.default ?? false
		},
		configureEngine(engine) {
			engine.appendAutocompleteExtraProperties('__important')
			engine.appendAutocompletePropertyValues('__important', 'boolean')
		},
		transformStyleDefinitions(styleDefinitions) {
			return styleDefinitions.map<StyleDefinition>((styleDefinition) => {
				const { __important, ...rest } = styleDefinition
				const value = __important as boolean | Nullish
				const important = value == null ? defaultValue : value

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
