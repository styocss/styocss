import { ATOMIC_STYLE_NAME_PLACEHOLDER } from '../constants'
import { resolvePlugins } from '../plugin'
// import { keyframes } from '../plugins/keyframes'
// import { variables } from '../plugins/variables'
import type { Autocomplete } from '../types'
import { addToSet, isNotString, isString } from '../utils'
import type { BasicEngineConfig, EngineConfig, PreflightFn, ResolvedCommonConfig, ResolvedEngineConfig, ResolvedSelectorConfig, ResolvedShortcutConfig, SelectorConfig, ShortcutConfig } from './types'

function resolveShortcutConfig(config: ShortcutConfig): ResolvedShortcutConfig | string {
	if (typeof config === 'string') {
		return config
	}
	else if (Array.isArray(config)) {
		if (typeof config[0] === 'string' && typeof config[1] !== 'function') {
			return {
				type: 'static',
				rule: {
					key: config[0],
					string: config[0],
					resolved: [config[1]].flat(1),
				},
				autocomplete: [config[0]],
			}
		}

		if (config[0] instanceof RegExp && typeof config[1] === 'function') {
			const fn = config[1]
			return {
				type: 'dynamic',
				rule: {
					key: config[0].source,
					stringPattern: config[0],
					createResolved: match => [fn(match)].flat(1),
				},
				autocomplete: config[2] != null ? [config[2]].flat(1) : [],
			}
		}
	}
	else if (typeof config.shortcut === 'string' && typeof config.value !== 'function') {
		return {
			type: 'static',
			rule: {
				key: config.shortcut,
				string: config.shortcut,
				resolved: [config.value].flat(1),
			},
			autocomplete: [config.shortcut],
		}
	}
	else if (config.shortcut instanceof RegExp && typeof config.value === 'function') {
		const fn = config.value
		return {
			type: 'dynamic',
			rule: {
				key: config.shortcut.source,
				stringPattern: config.shortcut,
				createResolved: match => [fn(match)].flat(1),
			},
			autocomplete: 'autocomplete' in config ? [config.autocomplete].flat(1) : [],
		}
	}

	throw new Error('Invalid shortcut config')
}

function resolveSelectorConfig(config: SelectorConfig): ResolvedSelectorConfig | string {
	if (typeof config === 'string') {
		return config
	}
	else if (Array.isArray(config)) {
		if (typeof config[0] === 'string' && typeof config[1] !== 'function') {
			return {
				type: 'static',
				rule: {
					key: config[0],
					string: config[0],
					resolved: [config[1]].flat(1),
				},
				autocomplete: [config[0]],
			}
		}

		if (config[0] instanceof RegExp && typeof config[1] === 'function') {
			const fn = config[1]
			return {
				type: 'dynamic',
				rule: {
					key: config[0].source,
					stringPattern: config[0],
					createResolved: match => [fn(match)].flat(1),
				},
				autocomplete: config[2] != null ? [config[2]].flat(1) : [],
			}
		}
	}
	else if (typeof config.selector === 'string' && typeof config.value !== 'function') {
		return {
			type: 'static',
			rule: {
				key: config.selector,
				string: config.selector,
				resolved: [config.value].flat(1),
			},
			autocomplete: [config.selector],
		}
	}
	else if (config.selector instanceof RegExp && typeof config.value === 'function') {
		const fn = config.value
		return {
			type: 'dynamic',
			rule: {
				key: config.selector.source,
				stringPattern: config.selector,
				createResolved: match => [fn(match)].flat(1),
			},
			autocomplete: 'autocomplete' in config ? [config.autocomplete].flat(1) : [],
		}
	}

	throw new Error('Invalid selector config')
}

function resolveBasicEngineConfig<Autocomplete_ extends Autocomplete = Autocomplete>(config: BasicEngineConfig<Autocomplete_>): ResolvedCommonConfig<Autocomplete_> {
	const resolvedConfig: ResolvedCommonConfig<Autocomplete_> = {
		selectors: [],
		shortcuts: [],
		// variables: [],
		// keyframes: [],
		preflights: [],
		autocomplete: {
			selectors: new Set(),
			shortcuts: new Set(),
			extraProperties: new Set(),
			properties: new Map(),
		},
	}

	const {
		preflights = [],
		selectors = [],
		shortcuts = [],
		// variables = [],
		// keyframes = [],
		autocomplete = {},
	} = config

	const resolvedSelectorConfigs = selectors.map(resolveSelectorConfig)
	resolvedConfig.selectors.push(...resolvedSelectorConfigs.filter(isNotString))
	addToSet(
		resolvedConfig.autocomplete.selectors,
		...autocomplete.selectors || [],
		...resolvedSelectorConfigs.filter(isString),
		...resolvedConfig.selectors.flatMap(s => s.autocomplete),
	)

	const resolvedShortcutConfigs = shortcuts.map(resolveShortcutConfig)
	resolvedConfig.shortcuts.push(...resolvedShortcutConfigs.filter(isNotString))
	addToSet(
		resolvedConfig.autocomplete.shortcuts,
		...autocomplete.shortcuts || [],
		...resolvedShortcutConfigs.filter(isString),
		...resolvedConfig.shortcuts.flatMap(s => s.autocomplete),
	)

	// resolvedConfig.keyframes.push(...keyframes.map(resolveKeyframesConfig))
	// resolvedConfig.variables.push(...variables.map(resolveVariableConfig))

	const resolvedPreflights = preflights.map<PreflightFn<Autocomplete_>>(p => (typeof p === 'function' ? p : () => p))
	resolvedConfig.preflights.push(...resolvedPreflights)
	addToSet(resolvedConfig.autocomplete.extraProperties, ...(autocomplete.extraProperties || []))
	Object.entries(autocomplete).forEach(([property, value]) => appendAutocompletePropertyValues<Autocomplete_>(resolvedConfig, property, ...[value].flat()))

	return resolvedConfig
}

export async function resolveEngineConfig<Autocomplete_ extends Autocomplete = Autocomplete>(config: EngineConfig<Autocomplete_>): Promise<ResolvedEngineConfig<Autocomplete_>> {
	const {
		prefix = '',
		defaultSelector = `.${ATOMIC_STYLE_NAME_PLACEHOLDER}`,
		plugins = [],
		...commonConfig
	} = config

	const resolvedCommonConfig = resolveBasicEngineConfig<Autocomplete_>(commonConfig)

	return {
		rawConfig: config,
		prefix,
		defaultSelector,
		plugins: await resolvePlugins<Autocomplete_>([
			// variables<Autocomplete_>(resolvedCommonConfig.variables),
			// keyframes<Autocomplete_>(resolvedCommonConfig.keyframes),
			...plugins,
		]),
		...resolvedCommonConfig,
	}
}

export function appendAutocompleteExtraProperties<Autocomplete_ extends Autocomplete = Autocomplete>(config: ResolvedCommonConfig<Autocomplete_>, ...properties: string[]) {
	addToSet(config.autocomplete.extraProperties, ...properties)
}

export function appendAutocompletePropertyValues<Autocomplete_ extends Autocomplete = Autocomplete>(config: ResolvedCommonConfig<Autocomplete_>, property: string, ...values: string[]) {
	const current = config.autocomplete.properties.get(property) || []
	config.autocomplete.properties.set(property, [...current, ...values])
}

export function defineShortcut(config: ShortcutConfig) {
	return config
}

export function defineSelector(config: SelectorConfig) {
	return config
}

// export function defineVariable(config: VariableConfig) {
// 	return config
// }

// export function defineKeyframes(config: KeyframesConfig) {
// 	return config
// }

export function defineEngineConfig<Autocomplete_ extends Autocomplete = Autocomplete>(config: EngineConfig<Autocomplete_>) {
	return config
}

export type * from './types'
