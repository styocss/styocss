/** Severity of a PikaCSS diagnostic. */
export type DiagnosticLevel = 'warning' | 'error'

/**
 * Structured diagnostic emitted by the PikaCSS engine or an engine plugin.
 *
 * @remarks Diagnostics are data only. The core package never assumes a console,
 * logger, browser, or Node.js runtime. Hosts decide how diagnostics are displayed.
 */
export interface Diagnostic {
	/** Diagnostic severity. */
	level: DiagnosticLevel
	/** Stable machine-readable identifier. */
	code: string
	/** Human-readable explanation. */
	message: string
	/** Original error or value related to the diagnostic. */
	cause?: unknown
	/** Plugin that produced the diagnostic, when applicable. */
	plugin?: string
	/** Plugin hook that produced the diagnostic, when applicable. */
	hook?: string
}

/** Callback used by a host to receive structured diagnostics. */
export type DiagnosticHandler = (diagnostic: Diagnostic) => void

/**
 * Host semantic metadata for one engine, supplied by the integration/bundler
 * host and transported — never interpreted — by the platform-neutral core.
 *
 * @remarks
 * The host (Vite adapter, Nuxt module, a programmatic caller) is the
 * authority for these values. Plugins consume them through
 * `context.host` so project-relative resources resolve against the same
 * effective PikaCSS project root as config discovery, scans, and generated
 * artifacts — never against `process.cwd()` once a host supplied a more
 * specific root (#118). Core adds no filesystem, path, or bundler APIs here.
 */
export interface EngineHostContext {
	/**
	 * The effective PikaCSS project root for this engine (e.g. Vite's
	 * `config.root`, Nuxt's `rootDir`). Absent for standalone `createEngine()`
	 * callers that supply no host context.
	 */
	readonly projectRoot?: string
	/**
	 * Opaque discriminator for PikaCSS-private generated CSS identities.
	 *
	 * @remarks Core transports this value without interpreting it. Subsystems
	 * and plugins that own private generated CSS names may consume it through
	 * `context.host`.
	 */
	readonly privateCssDiscriminator?: string
}

/** Context supplied when allocating a genuinely new atomic style ID. */
export interface AtomicStyleIdContext {
	/** Zero-based engine-local allocation index. */
	readonly index: number
	/** Resolved atomic style ID prefix. */
	readonly prefix: string
}

/** Strategy used by Core to allocate a genuinely new atomic style ID. */
export type AtomicStyleIdStrategy = (context: AtomicStyleIdContext) => string

/** Finalized external dependency descriptor for one Engine. */
export type EngineConfigDependency
	= | Readonly<{ type: 'file', path: string }>
		| Readonly<{ type: 'directory-membership', path: string }>

/** Runtime-only options accepted by {@link createEngine}. */
export interface CreateEngineOptions {
	/**
	 * Receives warnings and errors produced by this engine instance.
	 *
	 * @default A no-op handler.
	 */
	readonly onDiagnostic?: DiagnosticHandler
	/**
	 * Host semantic metadata for this engine (e.g. the effective project
	 * root). Exposed to plugins as `context.host`.
	 *
	 * @default An empty context.
	 */
	readonly host?: EngineHostContext
	/**
	 * Overrides atomic-style ID allocation for host integrations.
	 *
	 * @internal
	 */
	readonly atomicStyleIdStrategy?: AtomicStyleIdStrategy
	/**
	 * Receives each genuinely-new config dependency while the Engine is still
	 * initializing, including registrations made before a later initialization
	 * failure. Hosts use this only to preserve recovery metadata.
	 *
	 * @internal
	 */
	readonly onConfigDependency?: (dependency: EngineConfigDependency) => void
}

/**
 * Context passed to plugin hooks by the engine.
 *
 * @remarks
 * One context object exists per plugin definition **per engine** (#116): the
 * same object is passed to every hook invocation of that plugin/engine pair,
 * from `configureRawConfig` through committed notifications. Long-lived
 * callbacks a plugin registers (shortcut resolvers, preflight functions,
 * engine service methods) should close over this context — never over mutable
 * plugin-factory closure variables, which are shared across every engine
 * reusing the definition.
 */
export interface EnginePluginContext<State = void> {
	/** Instance-scoped diagnostic handler. */
	onDiagnostic: DiagnosticHandler
	/**
	 * Engine-local plugin state, created once per plugin/engine pair by the
	 * plugin's `createState()` initializer. `undefined` (typed `void`) for
	 * stateless plugins that omit the initializer.
	 */
	state: State
	/**
	 * Host semantic metadata for this engine (#118). Read-only from a
	 * plugin's perspective; empty when no host context was supplied.
	 */
	readonly host: EngineHostContext
}

/** Default diagnostic handler used by the platform-neutral core. */
export const noopDiagnosticHandler: DiagnosticHandler = (_diagnostic) => {}

/**
 * Delivers a diagnostic without allowing a faulty host handler to alter engine execution.
 *
 * @internal
 */
export function emitDiagnostic(handler: DiagnosticHandler, diagnostic: Diagnostic): void {
	try {
		handler(diagnostic)
	}
	catch {
		// Diagnostic reporting must never replace the engine's actual result or error.
	}
}
