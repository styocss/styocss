import type { Diagnostic, DiagnosticHandler } from '@pikacss/core'
import type { LoadedSources, ParsedThemeBlock } from './ir'
import type {
	DesignTokenGroup,
	DesignTokensConfig,
	DesignTokensLoader,
	DesignTokensRuntimeOptions,
	DesignTokensSource,
	DesignTokensSourceEntry,
	LoaderCtx,
	NormalizeCtx,
	TokenLayer,
} from './types'
import { isPlainObjectRecord, log } from '@pikacss/core'
import { isAbsolute, resolve } from 'pathe'
import { applyDtcgNormalizer } from './dtcg'

/**
 * Default diagnostic handler used when no host handler reaches the load stage.
 *
 * @remarks Shared with the plugin entry so {@link reportDiagnostic} can detect the
 * absent handler (by identity) and fall back to the console logger. `@pikacss/core`
 * exports its own no-op handler as a type only, so it cannot be reused here.
 */
export const noopDiagnosticHandler: DiagnosticHandler = (_diagnostic) => {}

// Delivers a load-stage diagnostic. With no host handler installed (the shared
// noop), it falls back to the console logger so file errors remain visible even
// when the host did not wire `onDiagnostic`; with a real handler it forwards a
// `design-tokens`-tagged diagnostic, never throwing.
function reportDiagnostic(onDiagnostic: DiagnosticHandler, diagnostic: Diagnostic): void {
	if (onDiagnostic === noopDiagnosticHandler) {
		const args = diagnostic.cause == null ? [] : [diagnostic.cause]
		if (diagnostic.level === 'error')
			log.error(diagnostic.message, ...args)
		else
			log.warn(diagnostic.message, ...args)
		return
	}
	try {
		onDiagnostic({ plugin: 'design-tokens', ...diagnostic })
	}
	catch {
		// Diagnostic delivery must not replace token parsing or resolution results.
	}
}

// An object is treated as a per-source entry when it has a `source` own property
// whose value is a source (string path or inline group). limit: an inline group
// whose top level literally contains a token/group named `source` must be wrapped
// in an entry (`{ source: <group> }`) to avoid being read as an entry.
function isSourceEntry(value: DesignTokensSource | DesignTokensSourceEntry): value is DesignTokensSourceEntry {
	return isPlainObjectRecord(value)
		&& 'source' in value
		&& (typeof value.source === 'string' || isPlainObjectRecord(value.source))
}

// Unwraps a source entry (or a bare source) into its source plus the effective
// prefix / layer, applying the global config prefix as the fallback.
function resolveEntry(
	entry: DesignTokensSource | DesignTokensSourceEntry,
	config: DesignTokensConfig,
): { source: DesignTokensSource, prefix: string, layer?: TokenLayer } {
	const globalPrefix = config.prefix ?? ''
	if (isSourceEntry(entry))
		return { source: entry.source, prefix: entry.prefix ?? globalPrefix, layer: entry.layer }
	return { source: entry, prefix: globalPrefix }
}

const TOKENS_FENCE_RE = /^```tokens([^\n]*)\n([\s\S]*?)^```/gm

function parseFenceAttrs(attrs: string): { theme?: string, selector?: string } {
	const result: { theme?: string, selector?: string } = {}
	const re = /(theme|selector)=(?:"([^"]*)"|'([^']*)'|(\S+))/g
	for (const match of attrs.matchAll(re)) {
		const key = match[1] as 'theme' | 'selector'
		result[key] = match[2] ?? match[3] ?? match[4]
	}
	return result
}

/**
 * Extracts design token blocks from a markdown design document.
 *
 * @param content - The markdown source (e.g. the content of a `design.md` file).
 * @returns The parsed base token groups and theme-scoped token blocks.
 *
 * @remarks Only fenced code blocks whose info string starts with `tokens` are read; all other markdown content is ignored.
 * The info string may carry `theme=<name>` and `selector=<css-selector>` attributes.
 * Block content must be valid JSON in the W3C Design Tokens format; invalid blocks are skipped with a warning.
 *
 * @example
 * ```ts
 * const { base, themeBlocks } = parseDesignMarkdown(await readFile('design.md', 'utf-8'))
 * ```
 */
export function parseDesignMarkdown(content: string): { base: DesignTokenGroup[], themeBlocks: ParsedThemeBlock[] } {
	const base: DesignTokenGroup[] = []
	const themeBlocks: ParsedThemeBlock[] = []
	for (const match of content.matchAll(TOKENS_FENCE_RE)) {
		const attrs = parseFenceAttrs(match[1]!)
		let parsed: unknown
		try {
			parsed = JSON.parse(match[2]!)
		}
		catch (error: any) {
			log.warn(`[design-tokens] Failed to parse tokens block: ${error.message}. Skipping.`)
			continue
		}
		if (!isPlainObjectRecord(parsed)) {
			log.warn('[design-tokens] Tokens block must contain a JSON object. Skipping.')
			continue
		}
		if (attrs.theme != null) {
			themeBlocks.push({ theme: attrs.theme, selector: attrs.selector, tokens: parsed as DesignTokenGroup })
		}
		else {
			base.push(parsed as DesignTokenGroup)
		}
	}
	return { base, themeBlocks }
}

/**
 * A single raw document produced by a loader before normalization. `themeScope`
 * marks documents that belong to a theme (e.g. a `theme=` fence inside a `.md`
 * source); base documents carry no scope.
 */
interface RawDoc {
	raw: unknown
	themeScope?: { theme: string, selector?: string }
}

/**
 * A loader resolved to its internal call shape. Both custom loaders and the
 * built-in `.md`/JSON handlers are expressed as this function so they run behind
 * the same seam. A single call may yield multiple docs (a `.md` file expands into
 * one doc per fence).
 */
type ResolvedLoader = (id: string, ctx: LoaderCtx) => Promise<RawDoc[]>

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

// Built-in markdown loader: reads the file, extracts every `tokens` fence, and
// returns one raw doc per fence (theme fences carry their scope). Read failures
// are reported through the diagnostic seam (logger fallback when unwired).
function makeMarkdownLoader(onDiagnostic: DiagnosticHandler): ResolvedLoader {
	return async (id, ctx) => {
		ctx.addDependency(id)
		let content: string
		try {
			content = await ctx.readFile(id)
		}
		catch (error: unknown) {
			reportDiagnostic(onDiagnostic, {
				level: 'error',
				code: 'design-tokens-read-error',
				message: `[design-tokens] Failed to read token source "${id}": ${errorMessage(error)}. Skipping.`,
				cause: error,
			})
			return []
		}
		const { base, themeBlocks } = parseDesignMarkdown(content)
		return [
			...base.map((raw): RawDoc => ({ raw })),
			...themeBlocks.map((block): RawDoc => ({
				raw: block.tokens,
				themeScope: { theme: block.theme, selector: block.selector },
			})),
		]
	}
}

// Built-in JSON loader: reads and parses the file into a single raw doc. Read and
// parse failures are reported through the diagnostic seam.
function makeJsonLoader(onDiagnostic: DiagnosticHandler): ResolvedLoader {
	return async (id, ctx) => {
		ctx.addDependency(id)
		let content: string
		try {
			content = await ctx.readFile(id)
		}
		catch (error: unknown) {
			reportDiagnostic(onDiagnostic, {
				level: 'error',
				code: 'design-tokens-read-error',
				message: `[design-tokens] Failed to read token source "${id}": ${errorMessage(error)}. Skipping.`,
				cause: error,
			})
			return []
		}
		try {
			const parsed = JSON.parse(content)
			if (!isPlainObjectRecord(parsed)) {
				reportDiagnostic(onDiagnostic, {
					level: 'warning',
					code: 'design-tokens-invalid-file-root',
					message: `[design-tokens] Token source "${id}" must contain a JSON object. Skipping.`,
				})
				return []
			}
			return [{ raw: parsed }]
		}
		catch (error: unknown) {
			reportDiagnostic(onDiagnostic, {
				level: 'error',
				code: 'design-tokens-invalid-file-json',
				message: `[design-tokens] Failed to parse token source "${id}": ${errorMessage(error)}. Skipping.`,
				cause: error,
			})
			return []
		}
	}
}

// Wraps a public custom loader into the internal ResolvedLoader shape. A custom
// loader returns a single raw value, so it always yields one base doc.
function wrapCustomLoader(loader: DesignTokensLoader): ResolvedLoader {
	return async (id, ctx) => [{ raw: await loader.load(id, ctx) }]
}

// Resolution order per source id: first matching custom loader wins; otherwise
// the built-in `.md`/JSON handling applies.
function resolveLoader(id: string, config: DesignTokensConfig, onDiagnostic: DiagnosticHandler): ResolvedLoader {
	const custom = config.loaders?.find(loader => loader.match(id))
	if (custom != null)
		return wrapCustomLoader(custom)
	if (id.endsWith('.md'))
		return makeMarkdownLoader(onDiagnostic)
	return makeJsonLoader(onDiagnostic)
}

// Picks the configured top-level partition subtree(s) out of a normalized theme
// group, stripping the partition key so the emitted token paths (and thus the
// variable names) are theme-agnostic. Passing several keys merges the subtrees
// (later keys override earlier ones on collision). A missing / non-group
// partition is warned about and skipped.
function applyThemeFrom(group: DesignTokenGroup, from: string | string[] | undefined): DesignTokenGroup {
	if (from == null)
		return group
	const merged: DesignTokenGroup = {}
	for (const key of [from].flat()) {
		const subtree = group[key]
		if (!isPlainObjectRecord(subtree)) {
			log.warn(`[design-tokens] Theme "from" partition "${key}" was not found or is not a token group. Skipping.`)
			continue
		}
		Object.assign(merged, subtree)
	}
	return merged
}

// Runs the ordered normalizer chain over a raw value. With no normalizers
// configured the raw value passes through unchanged, keeping built-in behavior
// byte-identical.
async function runNormalizers(raw: unknown, ctx: NormalizeCtx, config: DesignTokensConfig): Promise<DesignTokenGroup> {
	let value = raw
	for (const normalizer of config.normalizers ?? [])
		value = await normalizer.normalize(value, ctx)
	return value as DesignTokenGroup
}

// Collects every source id up front (base sources first, then theme sources) so
// normalizers can see sibling ids for cross-source resolution.
function collectSourceIds(config: DesignTokensConfig, root: string): string[] {
	const ids: string[] = []
	const add = (entry: DesignTokensSource | DesignTokensSourceEntry) => {
		const { source } = resolveEntry(entry, config)
		ids.push(typeof source === 'string'
			? (isAbsolute(source) ? resolve(source) : resolve(root, source))
			: 'inline')
	}
	for (const entry of [config.sources ?? []].flat())
		add(entry)
	for (const theme of Object.values(config.themes ?? {})) {
		for (const entry of [theme.sources ?? []].flat())
			add(entry)
	}
	return ids
}

// One raw document awaiting normalization, tagged with the scope it must be
// routed to once normalized. `scope` undefined means a base (`:root`) document.
interface PendingDoc {
	id: string
	raw: unknown
	scope?: { theme: string, selector?: string }
	/** Effective prefix for this doc's source (per-source override applied). */
	prefix: string
	/** Layer declared for this doc's source, if any. */
	layer?: TokenLayer
}

// Loads a single source into its raw documents (before normalization). Inline
// object sources bypass loaders (passthrough); string sources go through the
// resolved loader, sourcing `readFile` from the injected runtime. When the
// runtime provides no `readFile`, file sources are warned about and skipped
// (neutral entry behavior). A loader failure is reported and yields no docs, but
// any dependencies it registered before failing are still recorded.
async function loadRawDocs({
	source,
	root,
	projectRoot,
	loaded,
	config,
	runtime,
	onDiagnostic,
}: {
	source: DesignTokensSource
	root: string
	projectRoot: string
	loaded: LoadedSources
	config: DesignTokensConfig
	runtime: DesignTokensRuntimeOptions
	onDiagnostic: DiagnosticHandler
}): Promise<{ id: string, docs: RawDoc[] }> {
	if (typeof source !== 'string')
		return { id: 'inline', docs: [{ raw: source }] }

	const filepath = isAbsolute(source) ? resolve(source) : resolve(root, source)

	// Neutral entry: no host file loader is installed, so file sources cannot be
	// read. Warn and skip, mirroring the platform-neutral core behavior.
	const readFile = runtime.readFile
	if (readFile == null) {
		reportDiagnostic(onDiagnostic, {
			level: 'warning',
			code: 'design-tokens-file-loader-unavailable',
			message: `[design-tokens] File source "${source}" requires the Node.js adapter. Import designTokens from "@pikacss/plugin-design-tokens/node" or provide a custom readFile capability.`,
		})
		return { id: filepath, docs: [] }
	}

	const loader = resolveLoader(filepath, config, onDiagnostic)
	const ctx: LoaderCtx = {
		readFile: path => readFile(path),
		cwd: runtime.cwd?.() ?? '.',
		projectRoot,
		root,
		// Record dependencies even for loads that fail later; configureEngine
		// publishes this finalized list through the Engine runtime dependency capability.
		addDependency: (path) => { loaded.files.push(path) },
	}

	try {
		return { id: filepath, docs: await loader(filepath, ctx) }
	}
	catch (error: unknown) {
		reportDiagnostic(onDiagnostic, {
			level: 'error',
			code: 'design-tokens-loader-error',
			message: `[design-tokens] Loader failed for "${filepath}": ${errorMessage(error)}. Skipping.`,
			cause: error,
		})
		return { id: filepath, docs: [] }
	}
}

/**
 * Load stage: reads every configured base and theme source through the loader /
 * normalizer seam into raw token groups, recording each attempted file path as a
 * config dependency.
 *
 * @param config - The design tokens config.
 * @param runtime - Host capabilities (`readFile`, `cwd`) used to resolve
 * file-backed sources. When `readFile` is absent, file sources are warned about
 * and skipped; inline object sources still load.
 * @param onDiagnostic - Handler load-stage diagnostics are reported through;
 * falls back to the console logger when it is the shared no-op.
 *
 * @remarks Sources are loaded in two phases. First every source's raw documents
 * are collected, building a per-source-id content map so the bundled DTCG
 * normalizer can resolve cross-file `$ref` pointers against sibling sources.
 * Second, each document is normalized: the bundled DTCG normalizer runs first
 * (resolving `$ref`s, applying group-level `$type`/`$deprecated` inheritance),
 * then the configured normalizer chain (`config.normalizers`). Custom loaders
 * (`config.loaders`) are tried before the built-in `.md`/JSON handling. With no
 * custom loaders/normalizers and no DTCG-specific keys, behavior is
 * byte-identical to inline / JSON / markdown parsing.
 */
export async function loadAllSources(
	config: DesignTokensConfig,
	runtime: DesignTokensRuntimeOptions,
	onDiagnostic: DiagnosticHandler,
	hostProjectRoot?: string,
): Promise<LoadedSources> {
	// Root precedence (#118): the integration host's effective project root is
	// the authority for project-relative resolution; the runtime cwd is only a
	// standalone fallback. An explicit relative `config.root` resolves from the
	// project root — NOT the shell cwd — so an override cannot reintroduce the
	// split-root bug; an absolute `config.root` stays fully authoritative.
	const projectRoot = hostProjectRoot ?? runtime.cwd?.() ?? '.'
	const root = config.root == null
		? projectRoot
		: isAbsolute(config.root)
			? resolve(config.root)
			: resolve(projectRoot, config.root)
	const loaded: LoadedSources = { base: [], themeBlocks: [], files: [], baseMeta: [] }
	const sourceIds = collectSourceIds(config, root)

	// Phase 1: collect raw documents and index their contents by source id.
	const pending: PendingDoc[] = []
	const contentById = new Map<string, unknown[]>()
	// Resolved source id → effective prefix, so the DTCG normalizer can name a
	// cross-source `$ref` with the target source's prefix.
	const prefixById = new Map<string, string>()
	const record = (id: string, raw: unknown) => {
		const list = contentById.get(id) ?? []
		list.push(raw)
		contentById.set(id, list)
	}

	for (const entry of [config.sources ?? []].flat()) {
		const { source, prefix, layer } = resolveEntry(entry, config)
		const { id, docs } = await loadRawDocs({ source, root, projectRoot, loaded, config, runtime, onDiagnostic })
		prefixById.set(id, prefix)
		for (const doc of docs) {
			record(id, doc.raw)
			pending.push({ id, raw: doc.raw, scope: doc.themeScope, prefix, layer })
		}
	}

	for (const [themeName, theme] of Object.entries(config.themes ?? {})) {
		for (const entry of [theme.sources ?? []].flat()) {
			const { source, prefix, layer } = resolveEntry(entry, config)
			const { id, docs } = await loadRawDocs({ source, root, projectRoot, loaded, config, runtime, onDiagnostic })
			prefixById.set(id, prefix)
			for (const doc of docs)
				record(id, doc.raw)
			// Theme fences carry their own scope and go through as-is; a source's
			// base docs are wrapped in this theme's scope. Fences are pushed first
			// to preserve the legacy per-source ordering.
			for (const doc of docs.filter(d => d.themeScope != null))
				pending.push({ id, raw: doc.raw, scope: doc.themeScope, prefix, layer })
			for (const doc of docs.filter(d => d.themeScope == null))
				pending.push({ id, raw: doc.raw, scope: { theme: themeName, selector: theme.selector }, prefix, layer })
		}
	}

	// Phase 2: normalize each document (bundled DTCG normalizer, then the
	// configured chain) and route it to the base or theme output.
	for (const { id, raw, scope, prefix, layer } of pending) {
		const canonical = applyDtcgNormalizer(raw, { id, contentById, prefixById })
		const group = await runNormalizers(canonical, { id, root, sourceIds }, config)
		if (scope != null) {
			// `from` selects (and strips) a top-level partition of a shared theme
			// source; it is a config-only feature keyed by the theme name.
			const picked = applyThemeFrom(group, config.themes?.[scope.theme]?.from)
			loaded.themeBlocks.push({ theme: scope.theme, selector: scope.selector, tokens: picked, prefix, layer })
		}
		else {
			loaded.base.push(group)
			loaded.baseMeta!.push({ prefix, layer })
		}
	}

	return loaded
}
