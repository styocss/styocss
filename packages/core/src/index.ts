import type { EngineConfig } from './types'

export type { CreateEngineOptions, Diagnostic, DiagnosticHandler, DiagnosticLevel, EnginePluginContext } from './diagnostics'

/* c8 ignore start */
export {
	createEngine,
	type Engine,
	sortLayerNames,
	type StyleUsePlan,
} from './engine'

export {
	defineEnginePlugin,
	type EnginePlugin,
} from './plugin'

export type * from './plugins/important'
export type * from './plugins/keyframes'
export type * from './plugins/selectors'
export type * from './plugins/shortcuts'
export type * from './plugins/variables'

export type {
	AutocompleteConfig,
	AutocompleteContribution,
	AutocompletePatternsConfig,
	CSSStyleBlockBody,
	CSSStyleBlocks,
	DefineAutocomplete,
	EngineConfig,
	PikaAugment,
	Preflight,
	PreflightDefinition,
	PreflightFn,
	ResolvedLayerName,
	ResolvedPreflight,
} from './types'

export type {
	CSSProperty,
	CSSSelector,
	Properties,
	PropertyValue,
	StyleDefinition,
	StyleDefinitionMap,
	StyleItem,
} from './types'

export type * from './types/utils'

export {
	appendAutocomplete,
	createLogger,
	escapeRegExp,
	isPlainObjectRecord,
	log,
	renderCSSStyleBlocks,
} from './utils'

// define* helpers
/**
 * Identity helper that returns the engine configuration as-is, providing TypeScript type inference and autocompletion.
 *
 * @typeParam T - The exact literal type of the configuration object.
 * @param config - The engine configuration object.
 * @returns The same configuration object, unchanged.
 *
 * @remarks A compile-time-only helper with no runtime effect. Useful in `pika.config.ts` files for IDE support.
 *
 * @example
 * ```ts
 * export default defineEngineConfig({ prefix: 'pk-', plugins: [myPlugin()] })
 * ```
 */
export function defineEngineConfig<const T extends EngineConfig>(config: T): T {
	return config
}
/* c8 ignore end */
