import type {
	DefinedPikaConfig,
	MultiProjectConfigOptions,
	MultiProjectEntryConfig,
	SingleProjectConfig,
} from './types'
import { createMultiTransport, createSingleTransport } from './transport'

export type {
	DefinedPikaConfig,
	MultiProjectConfigOptions,
	MultiProjectEntryConfig,
	ReportConfig,
	ResolvedProjectConfig,
	ResolvedProjectEntry,
	ResolvedReportConfig,
	ResolvedScanConfig,
	ScanConfig,
	SingleProjectConfig,
} from './types'

export * from '@pikacss/core'

/**
 * Defines one canonical PikaCSS project configuration.
 *
 * @param config - Single-entry project settings, including the Engine configuration and project-owned runtime, scan, report, and generated-state options.
 * @remarks The returned value is an opaque transport intended only as a config
 * file default export. Do not inspect, spread, or mutate its runtime shape.
 */
export function defineConfig(config: SingleProjectConfig): DefinedPikaConfig
/**
 * Defines an explicit non-empty multi-entry PikaCSS project configuration.
 *
 * @param entries - Ordered project entries. Every explicit entry owns its callable root and logical CSS module.
 * @param options - Project-wide generated-state options shared by all entries.
 * @remarks Explicit multi-entry authoring remains distinct even when the array currently contains one entry; hosts must not infer single-entry CSS auto-import behavior from its length.
 */
export function defineConfig(entries: readonly [MultiProjectEntryConfig, ...MultiProjectEntryConfig[]], options?: MultiProjectConfigOptions): DefinedPikaConfig
export function defineConfig(
	configOrEntries: SingleProjectConfig | readonly [MultiProjectEntryConfig, ...MultiProjectEntryConfig[]],
	options: MultiProjectConfigOptions = {},
): DefinedPikaConfig {
	return Array.isArray(configOrEntries)
		? createMultiTransport(configOrEntries, options)
		: createSingleTransport(configOrEntries as SingleProjectConfig)
}
