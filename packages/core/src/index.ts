export {
	createEngine,
	defineEngineConfig,
	type Engine,
} from './internal/engine'

export {
	defineEnginePlugin,
	type EnginePlugin,
} from './internal/plugin'

export type {
	CSSStyleBlockBody,
	CSSStyleBlocks,
	DefineAutocomplete,
	EngineConfig,
	EngineExtraProperties,
	PikaAugment,
} from './internal/types'

export type * from './internal/types/utils'

export {
	appendAutocompleteCssPropertyValues,
	appendAutocompleteExtraCssProperties,
	appendAutocompleteExtraProperties,
	appendAutocompletePropertyValues,
	appendAutocompleteSelectors,
	appendAutocompleteStyleItemStrings,
	renderCSSStyleBlocks,
	setWarnFn,
	warn,
} from './internal/utils'

export type {
	CSSProperty,
	CSSSelectors,
	Properties,
	StyleDefinition,
	StyleItem,
} from './types'
