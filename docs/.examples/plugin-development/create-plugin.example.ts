import { defineEnginePlugin } from '@pikacss/core'

export function myPlugin() {
	return defineEnginePlugin({
		name: 'my-plugin',
		configureRawConfig: (config) => {
			config.layers ??= {}
			config.layers['my-layer'] = 5
		},
		configureEngine: async (engine) => {
			engine.runtime.addPreflight('/* my-plugin preflight */')
		},
	})
}
