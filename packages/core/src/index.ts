import type { EnginePlugin } from './internal/plugin'
import type { EngineConfig } from './internal/types'
import type { PluginsCustomConfig } from './internal/util-types'
import type { Autocomplete, CSSProperty, CSSSelectors, EmptyAutocomplete, Properties, StyleDefinition, StyleItem } from './types'

export {
	createEngine,
	type Engine,
} from './internal/engine'

export {
	type EnginePlugin,
} from './internal/plugin'

export type {
	EngineConfig,
} from './internal/types'

export type * from './internal/util-types'

export {
	appendAutocompleteCssPropertyValues,
	appendAutocompleteExtraCssProperties,
	appendAutocompleteExtraProperties,
	appendAutocompletePropertyValues,
	appendAutocompleteSelectors,
	appendAutocompleteStyleItemStrings,
} from './internal/utils'

export type {
	Autocomplete,
	EmptyAutocomplete,
	Properties,
	StyleDefinition,
	StyleItem,
} from './types'

// Only for type inference without runtime effect
/* c8 ignore start */
export function createDefineEnginePluginFn<A extends Autocomplete = EmptyAutocomplete>() {
	return function defineEnginePlugin<C extends Record<string, any>>(plugin: EnginePlugin<C, A['Selector'] | CSSSelectors, A['ExtraCssProperty'] | CSSProperty, Properties<A>, StyleDefinition<A>, StyleItem<A>>): EnginePlugin<C> {
		return plugin as any
	}
}
export const defineEnginePlugin = createDefineEnginePluginFn()

export function createDefineEngineConfigFn<A extends Autocomplete = EmptyAutocomplete>() {
	return function defineEngineConfig<P extends EnginePlugin[] = []>(config: EngineConfig<P, A['Selector'] | CSSSelectors, A['ExtraCssProperty'] | CSSProperty, Properties<A>, StyleDefinition<A>, StyleItem<A>> & PluginsCustomConfig<P>): EngineConfig<P> & PluginsCustomConfig<P> {
		return config as any
	}
}

export const defineEngineConfig = createDefineEngineConfigFn()
/* c8 ignore end */
