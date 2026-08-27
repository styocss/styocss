/**
 * User-facing bootstrap options for the PikaCSS bundler adapters.
 *
 * @remarks
 * Project semantics come from the file-based (or automatically discovered)
 * project config. The adapter only uses these options to locate that project
 * and, optionally, select the config file explicitly.
 */
export interface PluginOptions {
	/** Explicit path to the project config, resolved relative to `cwd`. */
	config?: string
	/** Project root used by the host adapter when one is not supplied by the bundler. */
	cwd?: string
}
