import type { EngineConfig } from './types'

export type { AtomicStyleIdContext, AtomicStyleIdStrategy, CreateEngineOptions, Diagnostic, DiagnosticHandler, DiagnosticLevel, EngineHostContext, EnginePluginContext } from './diagnostics'

/* c8 ignore start */
export {
	createEngine,
	type Engine,
	type EngineConfigDependency,
	sortLayerNames,
	type StyleUsePlan,
} from './engine'

export type { PikaManager, PikaRegistrationCapability } from './pika'

export {
	defineEnginePlugin,
	type EngineConfigurator,
	type EnginePlugin,
} from './plugin'
export type * from './plugins/important'

export type * from './plugins/keyframes'
export type * from './plugins/selectors'
export type * from './plugins/shortcuts'
export type * from './plugins/variables'
export type { TypegenManager, TypegenRegistrationCapability } from './typegen/registry'
export { renderTypegenDocument, type TransformedFormat, type TypegenRenderUnit } from './typegen/render'
export type { TypegenContribution, TypegenSnapshot, TypegenSnapshotContribution } from './typegen/snapshot'

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
