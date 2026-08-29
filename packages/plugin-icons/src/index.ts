import type { CustomCollections, CustomIconLoader, IconCustomizations, IconifyLoaderOptions, InlineCollection } from '@iconify/utils'
import type { DynamicShortcut, EnginePlugin, PreflightDefinition, ShortcutResolutionContext, StyleItem } from '@pikacss/core'
import type { WatchableIconCollection } from './watchable'
import { encodeSvgForCss, loadIcon, quicklyValidateIconSet, searchForIcon, stringToIcon } from '@iconify/utils'
import { defineEnginePlugin, escapeRegExp } from '@pikacss/core'
import { $fetch } from 'ofetch'
import { isAbsolute, resolve } from 'pathe'
import { createPrivateAssetVariableName } from './private-assets'
import { attachLocalIconLoaderScope } from './runtime-private'
import { getFileSystemIconCatalogMetadata, isWatchableIconCollection } from './watchable'

interface IconMeta {
	collection: string
	name: string
	svg: string
	source: IconSource
	mode?: IconsConfig['mode']
}

type IconSource = 'custom' | 'local' | 'cdn'

/** Host capability for loading locally installed icon collections. */
export { defineWatchableIconCollection, isWatchableIconCollection } from './watchable'
export type { IconCollectionDependencies, WatchableIconCollection, WatchableIconCollectionContext, WatchableIconSource, WatchableIconSourceContext } from './watchable'

/** Host capability loading an icon from a locally installed Iconify collection. */
export type LocalIconLoader = (collection: string, name: string, options: IconifyLoaderOptions) => Promise<string | null | undefined>

/** Logical catalog identities plus the files read to derive them. */
export interface LocalIconCatalogDiscoveryResult {
	/** Logical `prefix:name` identities discovered from directly declared Iconify catalogs. */
	readonly identities: readonly string[]
	/** Files read while discovering identities, including each root's governing manifest and catalog JSON files. */
	readonly dependencies: readonly string[]
}

/** Host capability for direct-member enumeration of built-in filesystem collections. */
export type FileSystemIconCatalogEnumerator = (directory: string, extension: string) => Promise<readonly string[]>

/** Host capability for discovering directly declared local Iconify catalogs. */
export type LocalIconCatalogDiscovery = (cwd: string | readonly string[]) => Promise<LocalIconCatalogDiscoveryResult>

/** Runtime capabilities used by the icons plugin. */
export interface IconsRuntimeOptions {
	/** Optional loader for locally installed icon collections. */
	loadLocalIcon?: LocalIconLoader
	/** Determines whether the local loader should run for the current host context. */
	shouldLoadLocalIcon?: () => boolean
	/** Node/host direct-member enumerator used only by the built-in filesystem catalog capability. */
	enumerateFileSystemIconNames?: FileSystemIconCatalogEnumerator
	/** Node/host discovery of directly declared Iconify logical identities for autocomplete. */
	discoverLocalIconCatalog?: LocalIconCatalogDiscovery
}
type ValidatedIconSet = NonNullable<ReturnType<typeof quicklyValidateIconSet>>

const RE_CAMEL_CASE_ICON_BOUNDARY = /([a-z])([A-Z])/g
const RE_DIGIT_ICON_BOUNDARY = /([a-z])(\d+)/g
const RE_TRAILING_SLASH = /\/$/

/**
 * Configuration options for the PikaCSS icons plugin.
 *
 * @remarks Controls how icon utilities are resolved, loaded, and rendered as CSS.
 * Icons are loaded from custom collections first, then from locally installed
 * Iconify packages when a local-loader capability is active, and finally from a
 * CDN if configured. The `/node` entry provides the built-in local loader; the
 * package root remains platform-neutral.
 *
 * @example
 * ```ts
 * import { icons } from '@pikacss/plugin-icons'
 * import { defineConfig } from '@pikacss/unplugin-pikacss'
 *
 * export default defineConfig({
 *   engine: {
 *     plugins: [icons()],
 *     icons: {
 *       prefix: 'i-',
 *       mode: 'auto',
 *       scale: 1,
 *       cdn: 'https://esm.sh/@iconify-json/{collection}/icons.json',
 *     },
 *   },
 * })
 * ```
 */
export interface IconsConfig {
	/**
	 * One or more prefixes used to match icon utility names. When a utility
	 * matches `<prefix><collection>:<name>`, it resolves to an icon style.
	 *
	 * @default `'i-'`
	 */
	prefix?: string | string[]

	/**
	 * Rendering strategy for icon SVGs. `'mask'` uses a CSS mask with
	 * `currentColor` as the fill, allowing color inheritance. `'bg'` renders
	 * the SVG as a background image with its original colors. `'auto'`
	 * chooses `'mask'` when the SVG contains `currentColor`, otherwise `'bg'`.
	 *
	 * @default `'auto'`
	 */
	mode?: 'auto' | 'mask' | 'bg'

	/**
	 * Multiplier passed to Iconify when `unit` is omitted, scaling the dimensions
	 * it resolves from the icon source. For Iconify JSON collections, that
	 * includes Iconify's `1em` fallback when no dimensions are available. When
	 * `unit` is configured, the same scale supplies the numeric part of the
	 * explicit `${scale}${unit}` dimensions described by `unit`.
	 *
	 * @default `1`
	 */
	scale?: number

	/**
	 * Custom icon collections keyed by collection name. Each entry maps
	 * icon names to SVG strings or async loaders, checked before any active
	 * local loader and the CDN. Ordinary entries are opaque to PikaCSS — the
	 * files an arbitrary loader reads cannot be inferred. Wrap an entry with
	 * `defineWatchableIconCollection` to declare collection-wide filesystem
	 * dependencies, or per-icon dependencies for members enumerable during
	 * Engine initialization. Request-only dependency callbacks do not expand
	 * the finalized watcher later (#122).
	 *
	 * @default `undefined`
	 */
	collections?: Record<string, CustomIconLoader | InlineCollection | WatchableIconCollection>

	/**
	 * Iconify customization hooks applied when loading icons. Allows
	 * transforming SVG attributes, trimming whitespace, and running per-icon
	 * logic via `iconCustomizer`. The plugin's `unit` filler runs in that
	 * callback before Iconify applies `additionalProps`; `extraProperties` are
	 * merged into those additional properties after the configured
	 * `customizations.additionalProps`.
	 *
	 * @default `{}`
	 */
	customizations?: IconCustomizations

	/**
	 * When enabled, automatically installs missing `@iconify-json/*` packages on
	 * demand during local icon resolution. With `cwd: string[]`, roots are
	 * searched in order; the built-in Iconify node loader passes `autoInstall`
	 * only for the final root, so earlier roots are lookup-only. Requires a
	 * local-loader capability such as `@pikacss/plugin-icons/node`; the
	 * platform-neutral package root does not install packages. With the built-in
	 * `/node` adapter, local loading (and therefore auto-install) is intentionally
	 * skipped while `process.env.ESLINT` is set.
	 *
	 * @default `false`
	 */
	autoInstall?: IconifyLoaderOptions['autoInstall']

	/**
	 * Search root used by the Iconify node loader when resolving locally installed
	 * icon packages. Accepts a `string` or `string[]`; array entries are searched
	 * in order, and the built-in node loader only attempts `autoInstall` for the
	 * final entry. The host `projectRoot` is resolved to an absolute path first;
	 * relative entries resolve against it, and omitted `cwd` defaults to that
	 * root. Without a host `projectRoot`, standalone use defaults to the current
	 * working directory and the effective value is still absolute. Requires a
	 * local-loader capability such as `@pikacss/plugin-icons/node`, or a custom
	 * capability passed to `createIconsPlugin(runtime)`.
	 *
	 * @default `undefined`
	 */
	cwd?: IconifyLoaderOptions['cwd']

	/**
	 * CDN URL template for fetching remote icon sets. Use `{collection}`
	 * as a placeholder for the collection name, or provide a base URL
	 * and the collection name will be appended as `<url>/<collection>.json`.
	 *
	 * @default `undefined`
	 */
	cdn?: string

	/**
	 * CSS unit appended to icon dimensions (e.g. `'em'`, `'rem'`). After the
	 * user's `iconCustomizer` runs, the plugin fills each missing or falsy
	 * width/height with `${scale}${unit}`. Iconify then applies
	 * `customizations.additionalProps`; `extraProperties` are merged after
	 * those values and therefore win on duplicate keys. Any remaining explicit
	 * dimension takes precedence over Iconify's source dimensions; if only one
	 * is present, Iconify derives the other from the SVG aspect ratio when it
	 * can. When omitted, Iconify uses the dimensions it resolves from the source
	 * and applies `scale`.
	 *
	 * @default `undefined`
	 */
	unit?: string

	/**
	 * Additional icon properties passed to Iconify and forwarded into every
	 * generated icon style item. They are merged after
	 * `customizations.additionalProps`, so duplicate keys—including
	 * `width`/`height`—use `extraProperties`.
	 *
	 * @default `{}`
	 */
	extraProperties?: Record<string, string>

	/**
	 * Post-processing callback invoked on each generated icon style item before
	 * it is returned. Receives the mutable style item and icon metadata. The
	 * metadata's `name` is the parsed/requested icon name carried through
	 * resolution; it is not guaranteed to be the canonical catalog key or an
	 * alias target.
	 *
	 * @default `undefined`
	 */
	processor?: (styleItem: StyleItem, meta: Required<IconMeta>) => void

	/**
	 * Explicit list of unprefixed logical icon identifiers (e.g. `'mdi:home'`;
	 * omit the configured shortcut prefix) to add to editor autocomplete
	 * suggestions. Each entry is combined with every configured prefix. This
	 * list is additive. The built-in `/node` catalog discovery also contributes
	 * names from the nearest governing `package.json` for each search root,
	 * considering only `dependencies`, `devDependencies`, and
	 * `optionalDependencies`; peer dependencies and ancestor manifests are not
	 * catalog-completion sources.
	 *
	 * @default `undefined`
	 */
	autocomplete?: string[]
}

declare module '@pikacss/core' {
	interface EngineConfig {
		/**
		 * Configuration for the icons plugin. Requires the `icons()` plugin
		 * to be registered in `plugins` for this configuration to take effect.
		 *
		 * @default `undefined`
		 */
		icons?: IconsConfig
	}
}

/**
 * Creates the PikaCSS icons engine plugin.
 *
 * @returns An engine plugin that lowers one dynamic icon family into the Core Shortcuts subsystem.
 *
 * @remarks The package-root `icons()` factory is platform-neutral: it resolves
 * custom collections and remote CDN sources, but does not provide a local
 * loader. The `/node` entry's `icons()` factory supplies PikaCSS's built-in
 * Node.js loader for locally installed `@iconify-json/*` packages. Use
 * `createIconsPlugin(runtime)` when a host needs to supply a different local
 * loading capability. Each matched utility is expanded into a CSS style item
 * using either mask or background rendering. Configure behavior through the
 * `icons` key in your engine config.
 *
 * @example
 * ```ts
 * import { icons } from '@pikacss/plugin-icons'
 * import { defineConfig } from '@pikacss/unplugin-pikacss'
 *
 * export default defineConfig({
 *   engine: {
 *     plugins: [icons()],
 *     icons: { prefix: 'i-', mode: 'auto' },
 *   },
 * })
 * ```
 */
export function icons(): EnginePlugin {
	return createIconsPlugin()
}

const currentColorRE = /currentColor/

function normalizePrefixes(prefix: Exclude<IconsConfig['prefix'], undefined>) {
	const prefixes = [prefix].flat()
		.filter(Boolean)
	return [...new Set(prefixes)]
}

function createShortcutRegExp(prefixes: string[]) {
	// Longest prefix first so overlapping prefixes (e.g. 'i-' and 'i-custom-') match correctly
	const sorted = [...prefixes].sort((a, b) => b.length - a.length)
	return new RegExp(`^(?:${sorted.map(escapeRegExp)
		.join('|')})([\\w:-]+)(?:\\?(mask|bg|auto))?$`)
}

function getPossibleIconNames(iconName: string) {
	return [
		iconName,
		iconName.replace(RE_CAMEL_CASE_ICON_BOUNDARY, '$1-$2')
			.toLowerCase(),
		iconName.replace(RE_DIGIT_ICON_BOUNDARY, '$1-$2'),
	]
}

function normalizeLogicalIconIdentity(value: string): string | null {
	const parsed = stringToIcon(value, true)
	if (parsed == null || !parsed.prefix)
		return null
	return `${parsed.prefix}:${parsed.name}`
}

function createShortcutCorpus(prefixes: readonly string[], logicalIdentities: Iterable<string>): string[] {
	const logical = [...new Set(logicalIdentities)].sort()
	return prefixes.flatMap(prefix => logical.map(identity => `${prefix}${identity}`))
		.sort()
}

function effectiveIconCwd(cwd: IconsConfig['cwd'], projectRoot: string): string | string[] {
	const values = cwd == null ? [projectRoot] : [cwd].flat()
	const resolved = values.map(value => isAbsolute(value) ? resolve(value) : resolve(projectRoot, value))
	return Array.isArray(cwd) ? resolved : resolved[0]!
}

function escapeTemplateLiteralSegment(value: string): string {
	return value
		.replaceAll('\\', '\\\\')
		.replaceAll('`', '\\`')
		.replaceAll('${', '\\${')
}

// Bare icons are explicit members of __PikaExplicitShortcuts. Mode authoring is
// derived strictly from those finalized members, so mask/bg/auto stay finite and
// do not duplicate each bare member's rich JSDoc.
function createShortcutInputType(prefixes: string[]): string {
	const barePatterns = prefixes.map((prefix) => {
		const escaped = escapeTemplateLiteralSegment(prefix)
		return `\`${escaped}\${string}:\${string}\``
	})
		.join(' | ')
	return `keyof { [K in Extract<keyof __PikaExplicitShortcuts & string, ${barePatterns}> as \`\${K}?\${'mask' | 'bg' | 'auto'}\`]: string }`
}

function resolveCdnCollectionUrl(cdn: string, collection: string) {
	if (cdn.includes('{collection}'))
		return cdn.replaceAll('{collection}', collection)
	return `${cdn.replace(RE_TRAILING_SLASH, '')}/${collection}.json`
}

function createLoaderOptions(config: IconsConfig, usedProps?: Record<string, string>): IconifyLoaderOptions {
	const {
		scale = 1,
		collections,
		autoInstall = false,
		cwd,
		unit,
		extraProperties = {},
		customizations = {},
	} = config

	const iconCustomizer = customizations.iconCustomizer

	return {
		addXmlNs: true,
		scale,
		// Plain custom collections are opaque loader functions / inline SVG maps
		// (CustomCollections from @iconify/utils): their file paths stay
		// unknowable and unwatched. The opt-in upgrade exists since #122 —
		// wrap entries with defineWatchableIconCollection to declare paths.
		// Watchable descriptors are unwrapped into plain loaders by
		// configureEngine before any resolution reaches this point (#122), so
		// the cast reflects the runtime invariant, not wishful typing.
		customCollections: collections as CustomCollections,
		autoInstall,
		cwd,
		usedProps,
		customizations: {
			...customizations,
			additionalProps: {
				...customizations.additionalProps,
				...extraProperties,
			},
			trimCustomSvg: customizations.trimCustomSvg ?? true,
			async iconCustomizer(collection, icon, props) {
				await iconCustomizer?.(collection, icon, props)
				if (!unit)
					return
				if (!props.width)
					props.width = `${scale}${unit}`
				if (!props.height)
					props.height = `${scale}${unit}`
			},
		},
	}
}

async function loadCollectionFromCdn(cdn: string, collection: string, cache: Map<string, Promise<ValidatedIconSet | undefined>>) {
	if (!cache.has(collection)) {
		cache.set(collection, (async () => {
			try {
				const response = await $fetch<unknown>(resolveCdnCollectionUrl(cdn, collection))
				return quicklyValidateIconSet(response) ?? undefined
			}
			catch {
				// Drop the failed entry so the next request retries instead of caching the failure forever
				cache.delete(collection)
				return undefined
			}
		})())
	}

	return cache.get(collection)!
}

async function resolveIcon(
	body: string,
	config: IconsConfig,
	runtime: IconsRuntimeOptions,
	cdnCollectionCache: Map<string, Promise<ValidatedIconSet | undefined>>,
	localLoaderScope: object,
) {
	const parsed = stringToIcon(body, true)
	if (parsed == null || !parsed.prefix)
		return null

	const customProps: Record<string, string> = {}
	const customSvg = await loadIcon(parsed.prefix, parsed.name, createLoaderOptions(config, customProps))
	if (customSvg != null) {
		return {
			collection: parsed.prefix,
			name: parsed.name,
			svg: customSvg,
			usedProps: customProps,
			source: 'custom' as const,
		}
	}

	if (runtime.loadLocalIcon != null && (runtime.shouldLoadLocalIcon?.() ?? true)) {
		const localProps: Record<string, string> = {}
		const localOptions = attachLocalIconLoaderScope({
			...createLoaderOptions(config, localProps),
			customCollections: undefined,
		}, localLoaderScope)
		const localSvg = await runtime.loadLocalIcon(parsed.prefix, parsed.name, localOptions)
		if (localSvg != null) {
			return {
				collection: parsed.prefix,
				name: parsed.name,
				svg: localSvg,
				usedProps: localProps,
				source: 'local' as const,
			}
		}
	}

	if (config.cdn) {
		const iconSet = await loadCollectionFromCdn(config.cdn, parsed.prefix, cdnCollectionCache)
		if (iconSet != null) {
			const remoteProps: Record<string, string> = {}
			const remoteSvg = await searchForIcon(
				iconSet,
				parsed.prefix,
				getPossibleIconNames(parsed.name),
				createLoaderOptions(config, remoteProps),
			)
			if (remoteSvg != null) {
				return {
					collection: parsed.prefix,
					name: parsed.name,
					svg: remoteSvg,
					usedProps: remoteProps,
					source: 'cdn' as const,
				}
			}
		}
	}

	return {
		collection: parsed.prefix,
		name: parsed.name,
		svg: null,
		usedProps: {},
		source: null,
	}
}

function deleteResolvedIconIfCurrent(
	cache: Map<string, ReturnType<typeof resolveIcon>>,
	body: string,
	pending: ReturnType<typeof resolveIcon>,
): void {
	if (cache.get(body) === pending)
		cache.delete(body)
}

interface PrivateIconAsset {
	readonly logicalId: string
	readonly variableName: string
	readonly value: string
}

function extractCssVariableReferences(value: string): string[] {
	return Array.from(value.matchAll(/var\(\s*(--[\w-]+)/g), match => match[1]!)
}

function renderPrivateAssetsPreflight(
	engine: { store: { atomicStyles: Map<string, { content: { value: string[] } }> } },
	usedAtomicStyleIds: ReadonlySet<string> | undefined,
	privateAssets: ReadonlyMap<string, PrivateIconAsset>,
	logicalIdByVariable: ReadonlyMap<string, string>,
): PreflightDefinition {
	const liveVariables = new Set<string>()
	engine.store.atomicStyles.forEach(({ content }, id) => {
		if (usedAtomicStyleIds != null && !usedAtomicStyleIds.has(id))
			return
		for (const value of content.value) {
			for (const variableName of extractCssVariableReferences(value)) {
				if (logicalIdByVariable.has(variableName))
					liveVariables.add(variableName)
			}
		}
	})
	const declarations: Record<string, string> = {}
	for (const variableName of [...liveVariables].sort()) {
		const logicalId = logicalIdByVariable.get(variableName)!
		const asset = privateAssets.get(logicalId)
		if (asset != null)
			declarations[variableName] = asset.value
	}
	return Object.keys(declarations).length === 0 ? {} : { ':root': declarations }
}

/**
 * Creates an icons plugin using host-provided runtime capabilities.
 *
 * @param runtime - Optional host-provided runtime capabilities. This factory
 * does not automatically provide the built-in Node.js loader; use
 * `@pikacss/plugin-icons/node` for that adapter or provide the required
 * capabilities explicitly here.
 * @returns An engine plugin that resolves icon utilities into CSS styles.
 */
export function createIconsPlugin(runtime: IconsRuntimeOptions = {}): EnginePlugin {
	// The plugin object is a reusable definition (#116): engine-local data
	// (resolved config, per-engine CDN cache) lives in `context.state`, never
	// in this factory closure. `runtime` stays here as immutable definition
	// configuration shared by every engine using this definition.
	return defineEnginePlugin({
		name: 'icons',

		createState: () => ({
			iconsConfig: {} as IconsConfig,
			prefixes: [] as string[],
			concreteShortcutCorpus: [] as string[],
			resolveShortcut: undefined as DynamicShortcut['resolve'] | undefined,
			resolvedIconCache: new Map<string, ReturnType<typeof resolveIcon>>(),
			privateAssets: new Map<string, PrivateIconAsset>(),
			logicalIdByVariable: new Map<string, string>(),
			// Per-engine on purpose: the CDN endpoint comes from this engine's
			// config, so entries must never be served to an engine configured
			// with a different `icons.cdn`.
			cdnCollectionCache: new Map<string, Promise<ValidatedIconSet | undefined>>(),
		}),

		configureRawConfig: async (config, context) => {
			const iconsConfig = config.icons ?? {}
			context.state.iconsConfig = iconsConfig
			const prefixes = normalizePrefixes(iconsConfig.prefix ?? 'i-')
			context.state.prefixes = prefixes
			context.state.concreteShortcutCorpus.splice(
				0,
				context.state.concreteShortcutCorpus.length,
				...createShortcutCorpus(prefixes, iconsConfig.autocomplete ?? []),
			)
			const definition: DynamicShortcut = {
				pattern: createShortcutRegExp(prefixes),
				inputType: createShortcutInputType(prefixes),
				resolve: (match, resolutionContext) => context.state.resolveShortcut?.(match, resolutionContext),
				autocomplete: context.state.concreteShortcutCorpus,
				description: 'Icon shortcut resolved from configured icon sources.',
			}
			config.shortcuts = {
				definitions: [
					...(config.shortcuts?.definitions ?? []),
					definition,
				],
			}
		},

		configureEngine: async (configurator) => {
			const engine = configurator.runtime
			const state = configurator.state
			const { iconsConfig, cdnCollectionCache } = state
			const {
				mode = 'auto',
				processor,
			} = iconsConfig
			const projectRoot = resolve(configurator.host.projectRoot ?? '.')
			const iconCwd = effectiveIconCwd(iconsConfig.cwd, projectRoot)
			const logicalIdentities = new Set<string>()

			const addLogicalIdentity = (raw: string, source: string) => {
				const logical = normalizeLogicalIconIdentity(raw)
				if (logical != null) {
					logicalIdentities.add(logical)
					return
				}
				configurator.onDiagnostic({
					level: 'warning',
					code: 'icons-invalid-catalog-identity',
					message: `Ignoring invalid icon catalog identity "${raw}" from ${source}`,
					plugin: 'icons',
				})
			}
			for (const value of iconsConfig.autocomplete ?? [])
				addLogicalIdentity(value, 'icons.autocomplete')

			const resolveDependencyPaths = async (descriptor: WatchableIconCollection, collection: string, name: string) => {
				const declared = typeof descriptor.dependencies === 'function'
					? await descriptor.dependencies({ collection, name })
					: descriptor.dependencies
				return [declared].flat()
					.map(path => isAbsolute(path) ? resolve(path) : resolve(projectRoot, path))
			}
			const effectiveCollections: CustomCollections = {}
			for (const [collectionName, value] of Object.entries(iconsConfig.collections ?? {})) {
				if (!isWatchableIconCollection(value)) {
					effectiveCollections[collectionName] = value
					if (value != null && typeof value === 'object' && !Array.isArray(value)) {
						for (const name of Object.keys(value))
							addLogicalIdentity(`${collectionName}:${name}`, `inline collection "${collectionName}"`)
					}
					continue
				}

				if (typeof value.dependencies !== 'function') {
					for (const path of await resolveDependencyPaths(value, collectionName, '*'))
						engine.addConfigDependency(path)
				}

				const filesystem = getFileSystemIconCatalogMetadata(value)
				if (filesystem != null) {
					const directory = isAbsolute(filesystem.dir) ? resolve(filesystem.dir) : resolve(projectRoot, filesystem.dir)
					engine.addConfigDirectoryMembershipDependency(directory)
					if (runtime.enumerateFileSystemIconNames == null)
						throw new Error(`Filesystem icon catalog "${collectionName}" requires a host enumerator`)
					const names = await runtime.enumerateFileSystemIconNames(directory, filesystem.extension)
					for (const name of [...new Set(names)].sort()) {
						addLogicalIdentity(`${collectionName}:${name}`, `filesystem collection "${collectionName}"`)
						for (const path of await resolveDependencyPaths(value, collectionName, name))
							engine.addConfigDependency(path)
					}
				}
				else if (typeof value.source === 'object' && value.source != null) {
					for (const name of Object.keys(value.source)
						.sort()) {
						addLogicalIdentity(`${collectionName}:${name}`, `inline watchable collection "${collectionName}"`)
						for (const path of await resolveDependencyPaths(value, collectionName, name))
							engine.addConfigDependency(path)
					}
				}

				effectiveCollections[collectionName] = async (iconName: string) => {
					const dependencies = await resolveDependencyPaths(value, collectionName, iconName)
					const source = value.source
					if (typeof source === 'function')
						return await source(iconName, { projectRoot, dependencies })
					const entry = source[iconName]
					return typeof entry === 'function' ? await entry() : entry
				}
			}

			if (runtime.discoverLocalIconCatalog != null) {
				const discovered = await runtime.discoverLocalIconCatalog(iconCwd)
				for (const dependency of discovered.dependencies)
					engine.addConfigDependency(isAbsolute(dependency) ? resolve(dependency) : resolve(projectRoot, dependency))
				for (const identity of discovered.identities)
					addLogicalIdentity(identity, 'directly declared Iconify catalog')
			}
			state.concreteShortcutCorpus.splice(0, state.concreteShortcutCorpus.length, ...createShortcutCorpus(state.prefixes, logicalIdentities))

			const effectiveConfig: IconsConfig = {
				...iconsConfig,
				collections: effectiveCollections,
				cwd: iconCwd,
			}
			// Preview may reuse one CDN collection while Core finalizes multiple
			// concrete members, but it must never warm the ordinary runtime cache.
			const previewCdnCollectionCache = new Map<string, Promise<ValidatedIconSet | undefined>>()
			const previewLocalLoaderScope = Object.freeze({})
			const runtimeLocalLoaderScope = Object.freeze({})

			engine.addPreflight({
				id: 'icons:private-assets',
				preflight: (runtimeEngine, _isFormatted, context) => renderPrivateAssetsPreflight(
					runtimeEngine,
					context?.usedAtomicStyleIds,
					state.privateAssets,
					state.logicalIdByVariable,
				),
			})

			state.resolveShortcut = async (match, resolutionContext?: ShortcutResolutionContext) => {
				let [full, body, _mode = mode] = match as unknown as [string, string, IconsConfig['mode']]
				const isPreview = resolutionContext?.preview != null
				let resolved
				if (isPreview) {
					resolved = await resolveIcon(body, effectiveConfig, runtime, previewCdnCollectionCache, previewLocalLoaderScope)
				}
				else {
					let pending = state.resolvedIconCache.get(body)
					if (pending == null) {
						const created = resolveIcon(body, effectiveConfig, runtime, cdnCollectionCache, runtimeLocalLoaderScope)
						state.resolvedIconCache.set(body, created)
						// Preserve the rejection for this caller, but do not let a
						// transient loader failure poison later resolutions.
						created.catch(() => deleteResolvedIconIfCurrent(state.resolvedIconCache, body, created))
						pending = created
					}
					resolved = await pending
					if (resolved?.svg == null)
						deleteResolvedIconIfCurrent(state.resolvedIconCache, body, pending)
				}

				if (resolved == null) {
					if (isPreview)
						throw new Error(`Invalid icon name "${full}"`)
					configurator.onDiagnostic({
						level: 'warning',
						code: 'icons-invalid-name',
						message: `invalid icon name "${full}"`,
						plugin: 'icons',
					})
					return {}
				}

				if (resolved.svg == null) {
					if (isPreview)
						throw new Error(`Failed to load icon "${full}"`)
					configurator.onDiagnostic({
						level: 'warning',
						code: 'icons-load-failed',
						message: `failed to load icon "${full}"`,
						plugin: 'icons',
					})
					return undefined
				}

				const logicalId = `${resolved.collection}:${resolved.name}`
				const variableName = createPrivateAssetVariableName(
					resolved.collection,
					resolved.name,
					configurator.host.privateCssDiscriminator,
				)
				if (isPreview) {
					resolutionContext.preview!.image({
						content: resolved.svg,
						mediaType: 'image/svg+xml',
						alt: logicalId,
					})
				}
				else {
					const value = `url("data:image/svg+xml;utf8,${encodeSvgForCss(resolved.svg)}")`
					state.privateAssets.set(logicalId, Object.freeze({ logicalId, variableName, value }))
					state.logicalIdByVariable.set(variableName, logicalId)
				}

				if (_mode === 'auto')
					_mode = currentColorRE.test(resolved.svg) ? 'mask' : 'bg'

				let styleItem: StyleItem
				if (_mode === 'mask') {
					styleItem = {
						'-webkit-mask': `var(${variableName}) no-repeat`,
						'mask': `var(${variableName}) no-repeat`,
						'-webkit-mask-size': '100% 100%',
						'mask-size': '100% 100%',
						'background-color': 'currentColor',
						'color': 'inherit',
						...resolved.usedProps,
					}
				}
				else {
					styleItem = {
						'background': `var(${variableName}) no-repeat`,
						'background-size': '100% 100%',
						'background-color': 'transparent',
						...resolved.usedProps,
					}
				}

				processor?.(
					styleItem,
					{
						collection: resolved.collection,
						name: resolved.name,
						svg: resolved.svg,
						source: resolved.source,
						mode: _mode,
					},
				)

				return styleItem
			}
		},
	})
}
