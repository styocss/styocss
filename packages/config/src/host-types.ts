import type { ResolvedProjectConfig, ResolvedScanConfig } from './types'

/** File dependency emitted by the low-level Config host. */
export interface ConfigHostFileDependency {
	/** Dependency discriminator for filesystem-backed config inputs. */
	readonly type: 'file'
	/** Absolute dependency path watched by the consuming host. */
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
	/** Canonical absolute project root used for config selection and normalization. */
	readonly projectRoot: string
	/** Selected config spelling, or `null` for the synthetic no-config default. */
	readonly selectedConfigPath: string | null
	/** Filesystem base for authored relative config values. */
	readonly configDir: string
	/** Fully normalized project configuration returned to the host. */
	readonly config: ResolvedProjectConfig
	/** Deterministic config-selection and evaluated-module dependency trace. */
	readonly dependencies: ConfigHostDependencyTrace
}

/** Efficient matcher for one normalized entry scan. */
export interface PikaScanMatcher {
	/** Returns whether one absolute physical source path belongs to the entry. */
	matches: (filePath: string) => boolean
}

/** Inputs for {@link createPikaScanMatcher}. */
export interface CreatePikaScanMatcherOptions {
	/** Normalized absolute include/exclude patterns for one scan entry. */
	readonly scan: ResolvedScanConfig
	/** Resolved project state directory, always excluded regardless of globs. */
	readonly stateDir: string
}

/** Error from Config-host selection, evaluation, or normalization. */
export class PikaConfigHostError extends Error {
	/** Project root associated with the failed host operation. */
	readonly projectRoot: string
	/** Selected config path when known, otherwise `null`. */
	readonly selectedConfigPath: string | null
	/** Dependency trace accumulated before the host operation failed. */
	readonly dependencies: ConfigHostDependencyTrace

	/**
	 * Creates an error carrying the failed config-host operation and its dependency trace.
	 *
	 * @param options - Failed operation details and the dependencies observed before it failed.
	 * @param options.message - Human-readable description of the config-host failure.
	 * @param options.projectRoot - Absolute project root used for config selection.
	 * @param options.selectedConfigPath - Selected config path, or `null` when no config was selected.
	 * @param options.dependencies - Config-selection and evaluated-module dependencies observed before the failure.
	 * @param options.cause - Underlying error, when one caused the failure.
	 */
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
