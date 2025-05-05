import { encodeSvgForCss, type IconifyLoaderOptions, loadIcon, type UniversalIconLoader } from '@iconify/utils'
import { defineEnginePlugin, type Engine, type EnginePlugin, type Simplify, type StyleItem, warn } from '@pikacss/core'
import { combineLoaders, createCDNFetchLoader, createNodeLoader, getEnvFlags, parseIconWithLoader, type IconsOptions as UnoIconsOptions } from '@unocss/preset-icons'
import { $fetch } from 'ofetch'

interface IconMeta {
	collection: string
	name: string
	svg: string
	mode?: IconsConfig['mode']
}

export type IconsConfig = Simplify<Omit<UnoIconsOptions, 'warn' | 'layer' | 'processor' | 'customFetcher'> & {
	/**
	 * Processor for the CSS object before stringify
	 */
	processor?: (styleItem: StyleItem, meta: Required<IconMeta>) => void

	/**
	 * Specify the icons for auto-completion.
	 */
	autocomplete?: string[]
}>

function createCDNLoader(cdnBase: string): UniversalIconLoader {
	return createCDNFetchLoader($fetch, cdnBase)
}

async function createIconsLoader(config: IconsConfig) {
	const {
		cdn,
	} = config

	const loaders: UniversalIconLoader[] = []

	const {
		isNode,
		isVSCode,
		isESLint,
	} = getEnvFlags()

	if (isNode && !isVSCode && !isESLint) {
		const nodeLoader = await createNodeLoader()
		if (nodeLoader != null)
			loaders.push(nodeLoader)
	}

	if (cdn)
		loaders.push(createCDNLoader(cdn))

	loaders.push(loadIcon)

	return combineLoaders(loaders)
}

const globalColonRE = /:/g

function createIconsPlugin(lookupIconLoader: (config: IconsConfig) => Promise<UniversalIconLoader>): EnginePlugin {
	let engine: Engine
	let iconsConfig: IconsConfig

	return defineEnginePlugin({
		name: 'icons',

		configureRawConfig: async (config) => {
			iconsConfig = config.icons || {}
		},

		configureEngine: async (_engine) => {
			engine = _engine
			const {
				scale = 1,
				mode = 'auto',
				prefix = 'i-',
				iconifyCollectionsNames,
				collections: customCollections,
				customizations = {},
				autoInstall = false,
				collectionsNodeResolvePath,
				unit,
				extraProperties = {},
				processor,
				autocomplete: _autocomplete,
			} = iconsConfig

			// const flags = getEnvFlags()

			const loaderOptions: IconifyLoaderOptions = {
				addXmlNs: true,
				scale,
				customCollections,
				autoInstall,
				cwd: collectionsNodeResolvePath,
				// avoid warn from @iconify/loader: we'll warn below if not found
				warn: void 0,
				customizations: {
					...customizations,
					additionalProps: { ...extraProperties },
					trimCustomSvg: true,
					async iconCustomizer(collection, icon, props) {
						await customizations.iconCustomizer?.(collection, icon, props)
						if (unit) {
							if (!props.width)
								props.width = `${scale}${unit}`
							if (!props.height)
								props.height = `${scale}${unit}`
						}
					},
				},
			}

			const prefixRE = new RegExp(`^(${[prefix].flat().join('|')})`)
			const autocompletePrefix = [prefix].flat()
			const autocomplete: string[] = [
				...autocompletePrefix,
				...autocompletePrefix.flatMap(p => _autocomplete?.map(a => `${p}${a.replace(prefixRE, '')}`) || []),
			]

			let iconLoader: UniversalIconLoader

			engine.extra.shortcuts.add({
				shortcut: new RegExp(`^(?:${[prefix].flat().join('|')})([\\w:-]+)(?:\\?(mask|bg|auto))?$`),
				value: async (match) => {
					let [full, body, _mode = mode] = match as [string, string, IconsConfig['mode']]

					iconLoader = iconLoader || await lookupIconLoader(iconsConfig)

					const usedProps = {}
					const parsed = await parseIconWithLoader(
						body,
						iconLoader,
						{ ...loaderOptions, usedProps },
						iconifyCollectionsNames,
					)

					if (parsed == null) {
						warn(`failed to load icon "${full}"`)
						return {}
					}

					const url = `url("data:image/svg+xml;utf8,${encodeSvgForCss(parsed.svg)}")`
					const varName = `--${engine.config.prefix}svg-icon-${body.replace(globalColonRE, '-')}`
					if (engine.extra.variables.store.has(varName) === false) {
						engine.extra.variables.add([varName, url, { asValueOf: '-', asProperty: false }])
					}

					if (_mode === 'auto')
						_mode = parsed.svg.includes('currentColor') ? 'mask' : 'bg'

					let styleItem: StyleItem

					if (_mode === 'mask') {
						// Thanks to https://codepen.io/noahblon/post/coloring-svgs-in-css-background-images
						styleItem = {
							'--svg-icon': `var(${varName})`,
							'-webkit-mask': 'var(--svg-icon) no-repeat',
							'mask': 'var(--svg-icon) no-repeat',
							'-webkit-mask-size': '100% 100%',
							'mask-size': '100% 100%',
							'background-color': 'currentColor',
							// for Safari https://github.com/elk-zone/elk/pull/264
							'color': 'inherit',
							...usedProps,
						}
					}
					else {
						styleItem = {
							'--svg-icon': `var(${varName})`,
							'background': 'var(--svg-icon) no-repeat',
							'background-size': '100% 100%',
							'background-color': 'transparent',
							...usedProps,
						}
					}

					processor?.(
						styleItem,
						{
							...parsed,
							mode: _mode,
						},
					)

					return styleItem
				},
				autocomplete,
			})
		},
	})
}

declare module '@pikacss/core' {
	interface EngineConfig {
		icons?: IconsConfig
	}
}

export function icons(): EnginePlugin {
	return createIconsPlugin(createIconsLoader)
}
