import type { EngineConfig } from '@pikacss/core'

/** Ordered scan patterns owned by one project entry. */
export interface ScanConfig {
	readonly include?: string | readonly string[]
	readonly exclude?: string | readonly string[]
}

/** Optional final production-build report configuration. */
export type ReportConfig = boolean | Readonly<{ output: string }>

/** Single-entry authoring form accepted by {@link defineConfig}. */
export interface SingleProjectConfig {
	readonly engine?: EngineConfig
	readonly fnName?: string
	readonly cssModule?: string
	readonly transformedFormat?: 'string' | 'array'
	readonly scan?: ScanConfig
	readonly report?: ReportConfig
	readonly stateDir?: string
}

/** One entry in the explicit multi-entry authoring form. */
export interface MultiProjectEntryConfig {
	readonly engine?: EngineConfig
	readonly fnName: string
	readonly cssModule: string
	readonly transformedFormat?: 'string' | 'array'
	readonly scan?: ScanConfig
	readonly report?: ReportConfig
}

/** Project-wide options for the explicit multi-entry authoring form. */
export interface MultiProjectConfigOptions {
	readonly stateDir?: string
}

declare const definedPikaConfigBrand: unique symbol

/** Opaque transport produced only by {@link defineConfig}. */
export interface DefinedPikaConfig {
	readonly [definedPikaConfigBrand]: true
}

/** Fully normalized ordered scan pattern lists. */
export interface ResolvedScanConfig {
	readonly include: readonly string[]
	readonly exclude: readonly string[]
}

/** Normalized report behavior; `false` disables reporting. */
export type ResolvedReportConfig = false | Readonly<{ output?: string }>

/** One normalized semantic project entry. */
export interface ResolvedProjectEntry {
	readonly engine: EngineConfig
	readonly fnName: string
	readonly cssModule: string
	readonly transformedFormat: 'string' | 'array'
	readonly scan: ResolvedScanConfig
	readonly report: ResolvedReportConfig
}

/** Canonical project semantic state consumed by host/runtime layers. */
export interface ResolvedProjectConfig {
	readonly authoringForm: 'single' | 'multi'
	readonly stateDir: string
	readonly entries: readonly ResolvedProjectEntry[]
}
