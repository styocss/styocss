import type { CustomCollections, CustomIconLoader, IconCustomizations, IconifyLoaderOptions, InlineCollection } from '@iconify/utils'
import type { DynamicShortcut, EnginePlugin, StyleItem } from '@pikacss/core'
import type { WatchableIconCollection } from './watchable'
import { encodeSvgForCss, loadIcon, quicklyValidateIconSet, searchForIcon, stringToIcon } from '@iconify/utils'
import { defineEnginePlugin, escapeRegExp } from '@pikacss/core'
import { $fetch } from 'ofetch'
import { isAbsolute, resolve } from 'pathe'
import { isWatchableIconCollection } from './watchable'

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

/** Runtime capabilities used by the icons plugin. */
export interface IconsRuntimeOptions {
	/** Optional loader for locally installed icon collections. */
	loadLocalIcon?: LocalIconLoader
	/** Determines whether the local loader should run for the current host context. */
	shouldLoadLocalIcon?: () => boolean
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
 * Iconify packages, and finally from a CDN if configured.
 *
 * @example
 * ```ts
 * import { defineEngineConfig } from '@pikacss/core'
 * import { icons } from '@pikacss/plugin-icons'
 *
 * export default defineEngineConfig({
 *   plugins: [icons()],
 *   icons: {
 *     prefix: 'i-',
 *     mode: 'auto',
 *     scale: 1,
 *     cdn: 'https://esm.sh/@iconify-json/{collection}/icons.json',
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
	 * Multiplier applied to the icon's intrinsic width and height.
	 * Combined with `unit` to produce the final CSS dimensions.
	 *
	 * @default `1`
	 */
	scale?: number

	/**
	 * Custom icon collections keyed by collection name. Each entry maps
	 * icon names to SVG strings or async loaders, checked before local
	 * packages and the CDN. Ordinary entries are opaque to PikaCSS — the
	 * files an arbitrary loader reads cannot be watched; wrap an entry with
	 * `defineWatchableIconCollection` to declare its filesystem dependencies
	 * and opt into dependency watching/HMR (#122).
	 *
	 * @default `undefined`
	 */
	collections?: Record<string, CustomIconLoader | InlineCollection | WatchableIconCollection>

	/**
	 * Iconify customization hooks applied when loading icons. Allows
	 * transforming SVG attributes, trimming whitespace, and running
	 * per-icon logic via `iconCustomizer`.
	 *
	 * @default `{}`
	 */
	customizations?: IconCustomizations

	/**
	 * When enabled, automatically installs missing `@iconify-json/*`
	 * packages on demand during local icon resolution.
	 *
	 * @default `false`
	 */
	autoInstall?: IconifyLoaderOptions['autoInstall']

	/**
	 * Working directory used by the Iconify node loader when resolving
	 * locally installed icon packages.
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
	 * CSS unit appended to the icon's width and height (e.g. `'em'`, `'rem'`).
	 * When set, produces explicit dimension values like `1em` based on `scale`.
	 * When omitted, dimensions are left to the SVG's intrinsic size.
	 *
	 * @default `undefined`
	 */
	unit?: string

	/**
	 * Additional CSS properties merged into every generated icon style item.
	 * Useful for adding `display`, `vertical-align`, or other layout properties.
	 *
	 * @default `{}`
	 */
	extraProperties?: Record<string, string>

	/**
	 * Post-processing callback invoked on each generated icon style item before
	 * it is returned. Receives the mutable style item and resolved icon metadata,
	 * allowing custom property injection or conditional transformations.
	 *
	 * @default `undefined`
	 */
	processor?: (styleItem: StyleItem, meta: Required<IconMeta>) => void

	/**
	 * Explicit list of icon identifiers (e.g. `'mdi:home'`) to include in
	 * editor autocomplete suggestions. Each entry is combined with every
	 * configured prefix.
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
 * @remarks The neutral entry resolves custom collections and remote CDN sources.
 * Locally installed `@iconify-json/*` packages require the `/node` adapter. Each matched utility is
 * expanded into a CSS style item using either mask or background rendering.
 * Configure behavior through the `icons` key in your engine config.
 *
 * @example
 * ```ts
 * import { icons } from '@pikacss/plugin-icons'
 *
 * export default defineEngineConfig({
 *   plugins: [icons()],
 *   icons: { prefix: 'i-', mode: 'auto' },
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

function createAutocomplete(prefixes: string[], autocomplete: string[] = []) {
	const prefixRE = new RegExp(`^(?:${prefixes.map(escapeRegExp)
		.join('|')})`)
	return [...new Set(prefixes.flatMap(prefix => autocomplete.map(icon => `${prefix}${icon.replace(prefixRE, '')}`)))]
}

function escapeTemplateLiteralSegment(value: string): string {
	return value
		.replaceAll('\\', '\\\\')
		.replaceAll('`', '\\`')
		.replaceAll('${', '\\${')
}

// E1 expresses the open icon family directly as template-literal input types.
// The bare `${prefix}${string}:${string}` member cannot exclude query-like suffixes
// from its final `${string}` segment; runtime `pattern` still accepts only the
// finite mask/bg/auto modes. E2 replaces mode authoring with the frozen strict
// finite mapped-type variants while retaining this same Shortcut-owned surface.
function createShortcutInputType(prefixes: string[]): string {
	return prefixes.flatMap((prefix) => {
		const escaped = escapeTemplateLiteralSegment(prefix)
		return [
			`\`${escaped}\${string}:\${string}\``,
			`\`${escaped}\${string}:\${string}?mask\``,
			`\`${escaped}\${string}:\${string}?bg\``,
			`\`${escaped}\${string}:\${string}?auto\``,
		]
	})
		.join(' | ')
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
		const localSvg = await runtime.loadLocalIcon(parsed.prefix, parsed.name, {
			...createLoaderOptions(config, localProps),
			customCollections: undefined,
		})
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

/**
 * Creates an icons plugin using host-provided runtime capabilities.
 *
 * @param runtime - Optional local icon loading capabilities supplied by the host adapter.
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
			resolveShortcut: undefined as DynamicShortcut['resolve'] | undefined,
			// Per-engine on purpose: the CDN endpoint comes from this engine's
			// config, so entries must never be served to an engine configured
			// with a different `icons.cdn`.
			cdnCollectionCache: new Map<string, Promise<ValidatedIconSet | undefined>>(),
		}),

		configureRawConfig: async (config, context) => {
			const iconsConfig = config.icons ?? {}
			context.state.iconsConfig = iconsConfig
			const prefixes = normalizePrefixes(iconsConfig.prefix ?? 'i-')
			const definition: DynamicShortcut = {
				pattern: createShortcutRegExp(prefixes),
				inputType: createShortcutInputType(prefixes),
				resolve: match => context.state.resolveShortcut?.(match),
				autocomplete: createAutocomplete(prefixes, iconsConfig.autocomplete),
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
			const { iconsConfig, cdnCollectionCache } = configurator.state
			const {
				mode = 'auto',
				processor,
			} = iconsConfig

			// Watchable collections (#122): unwrap branded descriptors into
			// plain custom loaders. Collection-wide static dependencies are
			// registered during Engine initialization; request-specific paths
			// remain loader context only in E1 because finalized Engine dependency
			// state is immutable. E2 moves enumerable member/file discovery into
			// generation derivation. Plain entries remain opaque.
			const projectRoot = configurator.host.projectRoot ?? '.'
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
					continue
				}
				// Collection-wide (non-function) dependencies are known now:
				// register them immediately so even the initial watcher set
				// includes them.
				if (typeof value.dependencies !== 'function') {
					for (const path of await resolveDependencyPaths(value, collectionName, '*'))
						engine.addConfigDependency(path)
				}
				effectiveCollections[collectionName] = async (iconName: string) => {
					const dependencies = await resolveDependencyPaths(value, collectionName, iconName)
					// Request-specific dependencies are discovered after Engine
					// initialization and therefore cannot mutate finalized config
					// dependencies. E2 moves enumerable member/file discovery into
					// generation derivation; opaque request-oriented sources still
					// receive their resolved dependency paths as loader context.
					const source = value.source
					if (typeof source === 'function')
						return await source(iconName, { projectRoot, dependencies })
					const entry = source[iconName]
					return typeof entry === 'function' ? await entry() : entry
				}
			}
			const effectiveConfig: IconsConfig = { ...iconsConfig, collections: effectiveCollections }

			configurator.state.resolveShortcut = async (match) => {
				let [full, body, _mode = mode] = match as unknown as [string, string, IconsConfig['mode']]
				const resolved = await resolveIcon(body, effectiveConfig, runtime, cdnCollectionCache)

				if (resolved == null) {
					configurator.onDiagnostic({
						level: 'warning',
						code: 'icons-invalid-name',
						message: `invalid icon name "${full}"`,
						plugin: 'icons',
					})
					return {}
				}

				if (resolved.svg == null) {
					configurator.onDiagnostic({
						level: 'warning',
						code: 'icons-load-failed',
						message: `failed to load icon "${full}"`,
						plugin: 'icons',
					})
					// Retryable-unresolved: returning undefined lets Core Shortcuts retry
					// a later resolution instead of caching a transient source failure.
					return undefined
				}

				const url = `url("data:image/svg+xml;utf8,${encodeSvgForCss(resolved.svg)}")`
				if (_mode === 'auto')
					_mode = currentColorRE.test(resolved.svg) ? 'mask' : 'bg'

				let styleItem: StyleItem
				if (_mode === 'mask') {
					// E1 keeps the SVG payload local to the resolved shortcut style. E2
					// replaces this with Icons-owned private-asset storage/publication;
					// it intentionally does not pass through the Variables subsystem.
					styleItem = {
						'--svg-icon': url,
						'-webkit-mask': 'var(--svg-icon) no-repeat',
						'mask': 'var(--svg-icon) no-repeat',
						'-webkit-mask-size': '100% 100%',
						'mask-size': '100% 100%',
						'background-color': 'currentColor',
						// for Safari https://github.com/elk-zone/elk/pull/264
						'color': 'inherit',
						...resolved.usedProps,
					}
				}
				else {
					styleItem = {
						'--svg-icon': url,
						'background': 'var(--svg-icon) no-repeat',
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
