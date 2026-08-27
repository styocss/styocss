import type { ResolvedProjectConfig, ResolvedScanConfig } from './types'

/** File dependency emitted by the low-level Config host. */
export interface ConfigHostFileDependency {
	readonly type: 'file'
	readonly path: string
}

/** Deterministic dependency trace for one config-load candidate. */
export interface ConfigHostDependencyTrace {
	/** Config-selection paths: all auto candidates or the exact explicit path. */
	readonly selection: readonly ConfigHostFileDependency[]
	/** Actually evaluated project-local config modules. */
	readonly modules: readonly ConfigHostFileDependency[]
	/** De-duplicated selection + module dependencies. */
	readonly all: readonly ConfigHostFileDependency[]
}

/** Low-level config selection input. */
export interface LoadPikaConfigOptions {
	/** Immutable absolute project root chosen by the host. */
	readonly projectRoot: string
	/** Closed explicit config-file selection. Omit for canonical auto-discovery. */
	readonly config?: string
	/** Resolved absolute host state-directory default used only when config omits stateDir. */
	readonly defaultStateDir?: string
}

/** Canonically loaded and normalized PikaCSS project configuration. */
export interface LoadedPikaConfig {
	readonly projectRoot: string
	/** Selected config spelling, or `null` for the synthetic no-config default. */
	readonly selectedConfigPath: string | null
	/** Filesystem base for authored relative config values. */
	readonly configDir: string
	readonly config: ResolvedProjectConfig
	readonly dependencies: ConfigHostDependencyTrace
}

/** Efficient matcher for one normalized entry scan. */
export interface PikaScanMatcher {
	/** Returns whether one absolute physical source path belongs to the entry. */
	matches: (filePath: string) => boolean
}

/** Inputs for {@link createPikaScanMatcher}. */
export interface CreatePikaScanMatcherOptions {
	readonly scan: ResolvedScanConfig
	/** Resolved project state directory, always excluded regardless of globs. */
	readonly stateDir: string
}

/** Error from Config-host selection, evaluation, or normalization. */
export class PikaConfigHostError extends Error {
	readonly projectRoot: string
	readonly selectedConfigPath: string | null
	readonly dependencies: ConfigHostDependencyTrace

	constructor({
		message,
		projectRoot,
		selectedConfigPath = null,
		dependencies,
		cause,
	}: {
		message: string
		projectRoot: string
		selectedConfigPath?: string | null
		dependencies: ConfigHostDependencyTrace
		cause?: unknown
	}) {
		super(message, cause === undefined ? undefined : { cause })
		this.name = 'PikaConfigHostError'
		this.projectRoot = projectRoot
		this.selectedConfigPath = selectedConfigPath
		this.dependencies = dependencies
	}
}
