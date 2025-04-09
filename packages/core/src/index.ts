import type { EnginePlugin } from './internal/plugin'
import type { EngineConfig } from './internal/types'
import type { PluginsCustomConfig } from './internal/util-types'
import type { Autocomplete, EmptyAutocomplete, Properties, StyleDefinition, StyleItem } from './types'

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
export function defineEnginePlugin<
	C extends Record<string, any>,
	A extends Autocomplete = EmptyAutocomplete,
>(
	plugin: EnginePlugin<C, Properties<A>, StyleDefinition<A>, StyleItem<A>>,
): EnginePlugin<C> {
	return plugin as any
}
/* c8 ignore end */

// Only for type inference without runtime effect
/* c8 ignore start */
export function defineEngineConfig<
	A extends Autocomplete = EmptyAutocomplete,
	P extends EnginePlugin[] = [],
>(
	config: EngineConfig<P, Properties<A>, StyleDefinition<A>, StyleItem<A>> & PluginsCustomConfig<P>,
	_autocomplete?: A,
): EngineConfig<P> & PluginsCustomConfig<P> {
	return config as any
}
/* c8 ignore end */
