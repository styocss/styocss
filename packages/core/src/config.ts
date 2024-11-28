import { ATOMIC_STYLE_NAME_PLACEHOLDER } from './constants'
import { type DynamicSelectorRule, type DynamicShortcutRule, type SelectorConfig, type ShortcutConfig, type StaticSelectorRule, type StaticShortcutRule, resolveSelectorConfigs, resolveShortcutConfigs } from './resolvers'

export interface CommonConfig {
	/**
	 * Preset list.
	 */
	presets?: PresetConfig[]
	/**
	 * Alias rules for `$selector` property.
	 *
	 * @default []
	 */
	selectors?: SelectorConfig[]
	/**
	 * Shortcut rules.
	 *
	 * @default []
	 */
	shortcuts?: ShortcutConfig[]
}

export interface PresetConfig extends CommonConfig {
	/**
	 * Name of preset.
	 */
	name: string
}

export function definePreset(preset: PresetConfig) {
	return preset
}

export interface EngineConfig extends CommonConfig {
	/**
	 * Prefix for atomic style name.
	 *
	 * @default ''
	 */
	prefix?: string
	/**
	 * Default value for `$selector` property. (`'$'` will be replaced with the atomic style name.)
	 *
	 * @example '.$' - Usage in class attribute: `<div class="a b c">`
	 * @example '[data-styo="$"]' - Usage in attribute selector: `<div data-styo="a b c">`
	 * @default '.$'
	 */
	defaultSelector?: string
}

export function defineEngineConfig(config: EngineConfig) {
	return config
}

export interface ResolvedCommonConfig {
	selectors: {
		static: StaticSelectorRule[]
		dynamic: DynamicSelectorRule[]
	}
	shortcuts: {
		static: StaticShortcutRule[]
		dynamic: DynamicShortcutRule[]
	}
}

export interface ResolvedEngineConfig extends ResolvedCommonConfig {
	prefix: string
	defaultSelector: string
}

export function resolveCommonConfig(config: CommonConfig): ResolvedCommonConfig {
	const resolvedConfig: ResolvedCommonConfig = {
		selectors: { static: [], dynamic: [] },
		shortcuts: { static: [], dynamic: [] },
	}

	const { presets = [], selectors = [], shortcuts = [] } = config

	presets.forEach((preset) => {
		const resolvedPresetConfig = resolveCommonConfig(preset)
		resolvedConfig.selectors.static.push(...resolvedPresetConfig.selectors.static)
		resolvedConfig.selectors.dynamic.push(...resolvedPresetConfig.selectors.dynamic)
		resolvedConfig.shortcuts.static.push(...resolvedPresetConfig.shortcuts.static)
		resolvedConfig.shortcuts.dynamic.push(...resolvedPresetConfig.shortcuts.dynamic)
	})

	const {
		static: staticSelectors,
		dynamic: dynamicSelectors,
	} = resolveSelectorConfigs(selectors)
	const {
		static: staticShortcuts,
		dynamic: dynamicShortcuts,
	} = resolveShortcutConfigs(shortcuts)

	resolvedConfig.selectors.static.push(...staticSelectors)
	resolvedConfig.selectors.dynamic.push(...dynamicSelectors)
	resolvedConfig.shortcuts.static.push(...staticShortcuts)
	resolvedConfig.shortcuts.dynamic.push(...dynamicShortcuts)

	return resolvedConfig
}

export function resolveEngineConfig(config: EngineConfig): ResolvedEngineConfig {
	const {
		prefix = '',
		defaultSelector = `.${ATOMIC_STYLE_NAME_PLACEHOLDER}`,
		...commonConfig
	} = config

	const resolvedCommonConfig = resolveCommonConfig(commonConfig)

	return {
		prefix,
		defaultSelector,
		...resolvedCommonConfig,
	}
}
