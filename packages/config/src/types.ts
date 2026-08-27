import type { EngineConfig } from '@pikacss/core'

/** Ordered scan patterns owned by one project entry. */
export interface ScanConfig {
	/**
	 * Source-file glob or globs to include in this entry's scan.
	 *
	 * @default `DEFAULT_SCAN_INCLUDE` (all supported JavaScript, TypeScript, and Vue source files)
	 */
	readonly include?: string | readonly string[]
	/**
	 * Source-file glob or globs to exclude after include matching.
	 *
	 * @default `node_modules/**`, `dist/**`, `.git/**`, `.nuxt/**`, `.output/**`, and `coverage/**`
	 */
	readonly exclude?: string | readonly string[]
}

/** Optional final production-build report configuration. */
export type ReportConfig = boolean | Readonly<{ output: string }>

/** Single-entry authoring form accepted by {@link defineConfig}. */
export interface SingleProjectConfig {
	/**
	 * Engine-specific configuration for this project entry.
	 *
	 * @default `{}`
	 */
	readonly engine?: EngineConfig
	/**
	 * Compile-time callable root used by this entry's source files.
	 *
	 * @default `'pika'`
	 */
	readonly fnName?: string
	/**
	 * Logical CSS module exposed by this entry's runtime stylesheet.
	 *
	 * @default `'pika.css'`
	 */
	readonly cssModule?: string
	/**
	 * Replacement shape emitted for the configured base callable.
	 *
	 * @default `'string'`
	 */
	readonly transformedFormat?: 'string' | 'array'
	/**
	 * Source scan patterns owned by this entry.
	 *
	 * @default Standard include and exclude patterns from `DEFAULT_SCAN_INCLUDE` and `DEFAULT_SCAN_EXCLUDE`.
	 */
	readonly scan?: ScanConfig
	/**
	 * Final production report behavior for this entry.
	 *
	 * @default `false`
	 */
	readonly report?: ReportConfig
	/**
	 * Project-wide directory for generated authoring state.
	 *
	 * @default Host-provided default, otherwise `.pikacss`.
	 */
	readonly stateDir?: string
}

/** One entry in the explicit multi-entry authoring form. */
export interface MultiProjectEntryConfig {
	/**
	 * Engine-specific configuration for this project entry.
	 *
	 * @default `{}`
	 */
	readonly engine?: EngineConfig
	/** Required compile-time callable root used by this entry's source files. */
	readonly fnName: string
	/** Required logical CSS module exposed by this entry's runtime stylesheet. */
	readonly cssModule: string
	/**
	 * Replacement shape emitted for the configured base callable.
	 *
	 * @default `'string'`
	 */
	readonly transformedFormat?: 'string' | 'array'
	/**
	 * Source scan patterns owned by this entry.
	 *
	 * @default Standard include and exclude patterns from `DEFAULT_SCAN_INCLUDE` and `DEFAULT_SCAN_EXCLUDE`.
	 */
	readonly scan?: ScanConfig
	/**
	 * Final production report behavior for this entry.
	 *
	 * @default `false`
	 */
	readonly report?: ReportConfig
}

/** Project-wide options for the explicit multi-entry authoring form. */
export interface MultiProjectConfigOptions {
	/**
	 * Directory shared by all entries for generated authoring state.
	 *
	 * @default Host-provided default, otherwise `.pikacss`.
	 */
	readonly stateDir?: string
}

declare const definedPikaConfigBrand: unique symbol

/** Opaque transport produced only by {@link defineConfig}. */
export interface DefinedPikaConfig {
	/**
	 * Internal opaque brand used to identify a transport created by `defineConfig()`.
	 *
	 * @internal
	 */
	readonly [definedPikaConfigBrand]: true
}

/** Fully normalized ordered scan pattern lists. */
export interface ResolvedScanConfig {
	/** Resolved include patterns used to select source files for scanning. */
	readonly include: readonly string[]
	/** Resolved exclude patterns applied after include matching. */
	readonly exclude: readonly string[]
}

/** Normalized report behavior; `false` disables reporting. */
export type ResolvedReportConfig = false | Readonly<{ output?: string }>

/** One normalized semantic project entry. */
export interface ResolvedProjectEntry {
	/** Engine-specific configuration retained for this entry. */
	readonly engine: EngineConfig
	/** Validated compile-time callable root for this entry. */
	readonly fnName: string
	/** Validated logical CSS module for this entry's runtime stylesheet. */
	readonly cssModule: string
	/** Normalized replacement shape emitted for the base callable. */
	readonly transformedFormat: 'string' | 'array'
	/** Resolved source scan patterns for this entry. */
	readonly scan: ResolvedScanConfig
	/** Normalized final production report behavior for this entry. */
	readonly report: ResolvedReportConfig
}

/** Canonical project semantic state consumed by host/runtime layers. */
export interface ResolvedProjectConfig {
	/** Authoring form used to create this project configuration. */
	readonly authoringForm: 'single' | 'multi'
	/** Resolved project-wide directory for generated authoring state. */
	readonly stateDir: string
	/** Normalized entries in their authored order. */
	readonly entries: readonly ResolvedProjectEntry[]
}
