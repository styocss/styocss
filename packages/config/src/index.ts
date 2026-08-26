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

/**
 * Defines one canonical PikaCSS project configuration.
 *
 * @remarks The returned value is an opaque transport intended only as a config
 * file default export. Do not inspect, spread, or mutate its runtime shape.
 */
export function defineConfig(config: SingleProjectConfig): DefinedPikaConfig
export function defineConfig(entries: readonly [MultiProjectEntryConfig, ...MultiProjectEntryConfig[]], options?: MultiProjectConfigOptions): DefinedPikaConfig
export function defineConfig(
	configOrEntries: SingleProjectConfig | readonly [MultiProjectEntryConfig, ...MultiProjectEntryConfig[]],
	options: MultiProjectConfigOptions = {},
): DefinedPikaConfig {
	return Array.isArray(configOrEntries)
		? createMultiTransport(configOrEntries, options)
		: createSingleTransport(configOrEntries as SingleProjectConfig)
}
