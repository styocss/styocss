import type { Arrayable, Awaitable } from '@pikacss/core'

/**
 * A single design token value as defined by the W3C Design Tokens draft.
 *
 * @remarks Strings may contain alias references in the form `{path.to.token}`, which are resolved to `var(--path-to-token)` in the generated CSS.
 */
export type DesignTokenValue = string | number | boolean | DesignTokenValue[] | { [key: string]: DesignTokenValue }

/**
 * A design token node: an object carrying a `$value` plus optional metadata.
 *
 * @example
 * ```ts
 * const token: DesignToken = { $value: '#3b82f6', $type: 'color', $description: 'Primary brand color' }
 * ```
 */
export interface DesignToken {
	/** The token value. Strings may reference other tokens via `{path.to.token}`. */
	$value: DesignTokenValue
	/** Optional token type (e.g. `'color'`, `'dimension'`, `'shadow'`, `'fontFamily'`). A token without its own `$type` inherits the nearest ancestor group's `$type`. */
	$type?: string
	/** Optional human-readable description. */
	$description?: string
	/**
	 * Marks the token as deprecated. Deprecated tokens still emit CSS variables, but their variable names are
	 * recorded in an internal registry so tooling can warn on usage. A group-level `$deprecated` applies to every
	 * descendant token unless the token sets its own value (token wins).
	 */
	$deprecated?: boolean
	/** Arbitrary DTCG `$extensions` metadata, carried through onto the normalized token for later batches to read. */
	$extensions?: Record<string, unknown>
}

/**
 * A nested group of design tokens following the W3C Design Tokens format.
 *
 * @remarks Keys are group or token names. A node with a `$value` property is a token; any other object is a nested group.
 *
 * @example
 * ```ts
 * const tokens: DesignTokenGroup = {
 *   color: {
 *     primary: { $value: '#3b82f6', $type: 'color' },
 *     accent: { $value: '{color.primary}' },
 *   },
 * }
 * ```
 */
export interface DesignTokenGroup {
	[name: string]: DesignToken | DesignTokenGroup | DesignTokenValue
}

/**
 * A design token source: an inline `DesignTokenGroup` object or a file path.
 *
 * @remarks File paths ending in `.md` are parsed as design documents (tokens are read from ` ```tokens ` fenced code blocks). Any other extension is parsed as a W3C Design Tokens JSON file. Relative paths resolve against `DesignTokensConfig.root`.
 */
export type DesignTokensSource = string | DesignTokenGroup

/**
 * Runtime capabilities used to load optional file-backed token sources.
 *
 * @remarks The platform-neutral entry accepts inline token objects only; file
 * sources require a `readFile` capability. Import `designTokens` from
 * `@pikacss/plugin-design-tokens/node` to inject `node:fs` + `process.cwd()`, or
 * pass a custom capability to the neutral entry.
 */
export interface DesignTokensRuntimeOptions {
	/** Reads a UTF-8 token source from an absolute path. */
	readFile?: (filepath: string) => Promise<string>
	/** Returns the runtime working directory used as the standalone project-root fallback when the engine host supplies no `projectRoot` (#118). It backs both an omitted and a relative {@link DesignTokensConfig.root}. */
	cwd?: () => string
}

/**
 * The architectural layer a token source belongs to.
 *
 * @remarks `primitive` tokens are raw values (a palette, a spacing scale);
 * `semantic` tokens map those primitives to intent (e.g. `surface`, `text`).
 * The layer is captured onto the generated variables' internal registry for a
 * later strict-mode batch to enforce layering rules. It does not affect the
 * emitted CSS.
 */
export type TokenLayer = 'primitive' | 'semantic'

/**
 * A source paired with per-source overrides. Use the object form in place of a
 * bare {@link DesignTokensSource} to give one source its own prefix or layer.
 *
 * @remarks An object is treated as a source entry when it has a `source` own
 * property. To use an inline {@link DesignTokenGroup} whose top level literally
 * contains a token or group named `source`, wrap it in an entry
 * (`{ source: <group> }`).
 *
 * @example
 * ```ts
 * const entry: DesignTokensSourceEntry = { source: './vendor.tokens.json', prefix: 'syno', layer: 'semantic' }
 * ```
 */
export interface DesignTokensSourceEntry {
	/** The underlying token source (inline group or file path). */
	source: DesignTokensSource
	/**
	 * Prefix for this source's emitted variable names and its own `{a.b.c}` alias
	 * resolution, overriding {@link DesignTokensConfig.prefix} for this source only.
	 * A cross-source `$ref` into this source uses this prefix for the emitted name.
	 */
	prefix?: string
	/** The architectural layer this source's tokens belong to. */
	layer?: TokenLayer
}

/**
 * Per-theme design token configuration.
 *
 * @example
 * ```ts
 * const dark: DesignTokensTheme = {
 *   selector: '[data-theme="dark"]',
 *   sources: { color: { primary: { $value: '#60a5fa' } } },
 * }
 * ```
 */
export interface DesignTokensTheme {
	/**
	 * The CSS selector scoping this theme's variables.
	 *
	 * @default `.${themeName}`
	 */
	selector?: string
	/**
	 * A media query this theme's variables are ADDITIONALLY emitted under, on top
	 * of the {@link DesignTokensTheme.selector} block. When set, the same variables
	 * are also emitted inside `@media <media>` wrapping `:root`, so a theme can
	 * activate both via an explicit class/attribute selector and automatically via
	 * a user preference (e.g. `'(prefers-color-scheme: dark)'`).
	 *
	 * @default undefined (no media-scoped emission)
	 */
	media?: string
	/**
	 * Top-level partition subtree key(s) to pick out of this theme's sources. When
	 * a single shared source file holds several theme partitions at its top level
	 * (e.g. `light-mode`, `dark-mode`), each theme selects its own partition here.
	 * The partition key is STRIPPED from token paths, so the emitted variable names
	 * are theme-agnostic (`--surface-z0`, not `--light-mode-surface-z0`). Passing an
	 * array merges the selected subtrees (later keys override earlier ones on
	 * collision).
	 *
	 * @default undefined (the whole source is used)
	 */
	from?: string | string[]
	/**
	 * Token sources providing this theme's overrides. Entries may be bare
	 * {@link DesignTokensSource}s or {@link DesignTokensSourceEntry} objects
	 * carrying a per-source `prefix` / `layer`.
	 */
	sources?: Arrayable<DesignTokensSource | DesignTokensSourceEntry>
}

/**
 * Context passed to a {@link DesignTokensLoader}'s `load` method.
 */
export interface LoaderCtx {
	/** Reads a file's UTF-8 text content. */
	readFile: (path: string) => Promise<string>
	/**
	 * The host runtime's working directory.
	 *
	 * @remarks Legacy runtime information, kept for compatibility — NOT the
	 * project identity. Use {@link LoaderCtx.projectRoot} for the effective
	 * PikaCSS project root and {@link LoaderCtx.root} for the effective
	 * design-token root (#118).
	 */
	cwd: string
	/** The effective PikaCSS project root supplied by the engine host, falling back to the runtime cwd for standalone use (#118). */
	projectRoot: string
	/** The effective design-token root after precedence resolution: an absolute {@link DesignTokensConfig.root}, a relative one resolved from `projectRoot`, or `projectRoot` itself when omitted. Relative source paths resolve against this. */
	root: string
	/**
	 * Registers `path` as an engine config dependency so integrations reload when the file changes.
	 *
	 * @remarks Register the path **before** attempting to read it: a path that fails to load must still be
	 * watched so creating or fixing the file later triggers a config reload. This flows into the same
	 * `engine.addConfigDependency` mechanism the built-in file loaders use.
	 */
	addDependency: (path: string) => void
}

/**
 * A custom source loader. Loaders turn a source id (a file path) into a raw value
 * that the {@link DesignTokensNormalizer} chain then converts into a {@link DesignTokenGroup}.
 *
 * @remarks For each string source, the first loader whose `match` returns `true` for the resolved id wins;
 * if none match, the built-in behavior applies (a `.md` path is parsed as a design document, any other path
 * is parsed as W3C Design Tokens JSON). Inline object sources bypass loaders entirely (passthrough).
 *
 * @example
 * ```ts
 * const yamlLoader: DesignTokensLoader = {
 *   name: 'yaml',
 *   match: id => id.endsWith('.yaml') || id.endsWith('.yml'),
 *   load: async (id, ctx) => {
 *     ctx.addDependency(id)
 *     return parseYaml(await ctx.readFile(id))
 *   },
 * }
 * ```
 */
export interface DesignTokensLoader {
	/** Loader name, used in diagnostics. */
	name: string
	/** Returns `true` when this loader should handle the given resolved source id. */
	match: (id: string) => boolean
	/** Loads the raw value for `id`; the returned value is fed through the normalizer chain. */
	load: (id: string, ctx: LoaderCtx) => Awaitable<unknown>
}

/**
 * Context passed to a {@link DesignTokensNormalizer}'s `normalize` method.
 */
export interface NormalizeCtx {
	/** The source being normalized: a resolved file path, or `'inline'` for inline object sources. */
	id: string
	/** The configured {@link DesignTokensConfig.root}. */
	root: string
	/**
	 * All source ids loaded in this pass, in load order (base sources first, then theme sources).
	 *
	 * @remarks Exposed so a normalizer can resolve cross-source references (e.g. a `$ref` that points into a
	 * sibling file) by knowing the full set of sibling ids. Inline object sources appear as `'inline'`.
	 */
	sourceIds: readonly string[]
}

/**
 * A normalizer converts a raw loaded value into a canonical {@link DesignTokenGroup}.
 *
 * @remarks Normalizers run as an ordered chain over each loaded raw source before it enters the flatten
 * stage; each normalizer receives the previous normalizer's output. With no normalizers configured, the raw
 * value passes through unchanged, so built-in `.md`/JSON/inline behavior is preserved byte-for-byte.
 */
export interface DesignTokensNormalizer {
	/** Normalizer name, used in diagnostics. */
	name: string
	/** Converts the raw value (or the previous normalizer's output) into a {@link DesignTokenGroup}. */
	normalize: (raw: unknown, ctx: NormalizeCtx) => Awaitable<DesignTokenGroup>
}

/**
 * Severity of a strict-mode governance check.
 *
 * @remarks `'off'` suppresses the check entirely, `'warn'` reports it as a
 * `'warning'` diagnostic, and `'error'` reports it as an `'error'` diagnostic.
 * Diagnostics are reported through the engine's `onDiagnostic` handler during
 * `transformStyleDefinitions` — they are never thrown.
 */
export type StrictLevel = 'off' | 'warn' | 'error'

/**
 * Strict-mode configuration: governs which literal values are allowed on
 * design-token-governed CSS properties and surfaces violations as diagnostics.
 *
 * @remarks Strict mode is opt-in and defaults to `'off'`, which adds no
 * diagnostics and takes a near-zero-cost early-return path in the transform hook.
 * A property is *governed* when it appears in the merged
 * {@link DesignTokensConfig.typeAutocomplete} map for a `$type` that has at least
 * one registered token. Values on governed properties are validated against the
 * governing `$type`; violations are reported at the effective level for that
 * property (property-key override beats `$type`-key override beats
 * {@link DesignTokensStrictConfig.level}).
 *
 * @example
 * ```ts
 * const strict: DesignTokensStrictConfig = {
 *   level: 'error',
 *   overrides: { 'background-color': 'warn', dimension: 'off' },
 *   allowedValues: ['0', /^var\(--legacy-/],
 *   semanticOnly: true,
 * }
 * ```
 */
export interface DesignTokensStrictConfig {
	/**
	 * Baseline severity applied to every governed property.
	 *
	 * @default 'off'
	 */
	level?: StrictLevel
	/**
	 * Per-key severity overrides. A key is a CSS property name (e.g.
	 * `'background-color'`) or a DTCG `$type` (e.g. `'color'`). A property-key
	 * override wins over a `$type`-key override, which wins over
	 * {@link DesignTokensStrictConfig.level}.
	 *
	 * @default undefined
	 */
	overrides?: Record<string, StrictLevel>
	/**
	 * Extra literal values accepted on any governed property, on top of the
	 * built-in per-`$type` allowlist. A string entry is matched exactly against the
	 * trimmed value; a `RegExp` entry is tested against the trimmed value.
	 *
	 * @default undefined
	 */
	allowedValues?: (string | RegExp)[]
	/**
	 * When `true` (and {@link DesignTokensStrictConfig.level} is not `'off'`), a
	 * value referencing a `primitive`-layer token is a violation: only
	 * `semantic`-layer tokens may be used in authored styles. Additionally,
	 * `primitive`-layer tokens are hidden from suggestions at emit time
	 * (`asValueOf: false`, `asProperty: false`).
	 *
	 * @default false
	 */
	semanticOnly?: boolean
	/**
	 * When `true`, the generated `pika.gen.ts` narrows the accepted TypeScript
	 * value type of every governed CSS property to an exclusive union, so invalid
	 * literals red-squiggle in the IDE before any build runs. The union admits, and
	 * only admits: a `var(--token)` reference (with an optional `var(--token,
	 * fallback)` form) for each token of the governing `$type`, the CSS-wide
	 * keywords, the built-in per-`$type` allowlist and any string
	 * {@link DesignTokensStrictConfig.allowedValues}, and template-literal escape
	 * hatches for the functional forms (`calc()`, `color-mix()`, `min()`, `max()`,
	 * `clamp()`, `light-dark()`).
	 *
	 * @remarks Independent of {@link DesignTokensStrictConfig.level}: type
	 * narrowing is a compile-time surface, while `level` governs the build-time
	 * diagnostics. When `false` or absent, the generated types are byte-identical
	 * to a project without strict types. If any `RegExp`
	 * {@link DesignTokensStrictConfig.allowedValues} entry is present, type
	 * narrowing is disabled entirely (all properties stay permissive) because an
	 * arbitrary `RegExp` cannot be faithfully represented as a literal union
	 * without risking rejection of a value the runtime accepts.
	 *
	 * @default false
	 */
	types?: boolean
}

/**
 * Configuration object for the `designTokens` engine option.
 *
 * @example
 * ```ts
 * const config: DesignTokensConfig = {
 *   sources: ['./design.md'],
 *   themes: { dark: { sources: ['./design.dark.tokens.json'] } },
 * }
 * ```
 */
export interface DesignTokensConfig {
	/**
	 * Base token sources emitted under `:root`. Later sources override earlier ones
	 * when names collide. Entries may be bare {@link DesignTokensSource}s or
	 * {@link DesignTokensSourceEntry} objects carrying a per-source `prefix` / `layer`.
	 */
	sources?: Arrayable<DesignTokensSource | DesignTokensSourceEntry>

	/**
	 * Custom source loaders, tried before the built-in `.md`/JSON handling. For each string source, the first
	 * loader whose `match` returns `true` for the resolved id wins; if none match, the built-in behavior applies.
	 *
	 * @default undefined
	 */
	loaders?: DesignTokensLoader[]

	/**
	 * Normalizers run as an ordered chain over each loaded raw source before it enters the flatten stage.
	 * With no normalizers configured, raw values pass through unchanged.
	 *
	 * @default undefined
	 */
	normalizers?: DesignTokensNormalizer[]

	/** Theme overrides keyed by theme name. Tokens are emitted under the theme's selector. */
	themes?: Record<string, DesignTokensTheme>

	/**
	 * Per-`$type` variable-suggestion override map, merged over the built-in
	 * {@link import('./autocomplete').DEFAULT_TYPE_AUTOCOMPLETE} map. A token whose
	 * `$type` is present in the merged map emits `VariableSuggest.asValueOf`
	 * with that property list, so the variable is suggested as a `var()` value for
	 * exactly those CSS properties.
	 *
	 * @remarks Each entry replaces the default list for that `$type`. A `false`
	 * value suppresses value-of suggestions for that `$type` entirely (emitting
	 * `asValueOf: false`). Tokens without a `$type`, or with a `$type` absent from the
	 * merged map, emit no `suggest.asValueOf` field, so the Core Variables default
	 * remains `false`.
	 *
	 * @default undefined (the built-in default map applies as-is)
	 */
	typeAutocomplete?: Record<string, Arrayable<string> | false>

	/**
	 * Prefix prepended to every generated CSS variable name (without leading `--`).
	 *
	 * @default '' (no prefix)
	 */
	prefix?: string

	/**
	 * Base directory used to resolve relative source file paths.
	 *
	 * @remarks An absolute path is authoritative; a relative path resolves from the engine host's project root (#118).
	 *
	 * @default The engine host's project root; standalone use falls back to the runtime's working directory, then `'.'` when no capability is provided.
	 */
	root?: string

	/**
	 * Pruning override applied to every generated variable. When unset, the `variables` config default applies.
	 *
	 * @default undefined
	 */
	pruneUnused?: boolean

	/**
	 * Strict-mode governance of authored style values. See {@link DesignTokensStrictConfig}.
	 *
	 * @default undefined (strict mode off)
	 */
	strict?: DesignTokensStrictConfig
}
