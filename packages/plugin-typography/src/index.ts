import type { EnginePlugin } from '@pikacss/core'
import { defineEnginePlugin } from '@pikacss/core'
import {
	proseBaseStyle,
	proseCodeStyle,
	proseEmphasisStyle,
	proseHeadingsStyle,
	proseHrStyle,
	proseKbdStyle,
	proseLinksStyle,
	proseListsStyle,
	proseMediaStyle,
	proseParagraphsStyle,
	proseQuotesStyle,
	proseTablesStyle,
	typographyVariables,
} from './styles'

/**
 * Configuration options for the typography plugin.
 *
 * @remarks Pass this object under the `typography` key in your engine config
 * to customize prose color variables.
 *
 * @example
 * ```ts
 * const config = {
 *   typography: {
 *     variables: { '--pk-prose-color-links': '#3b82f6' },
 *   },
 * }
 * ```
 */
export interface TypographyPluginOptions {
	/**
	 * Partial overrides for the default prose CSS custom properties.
	 *
	 * @default `{}`
	 */
	variables?: Partial<typeof typographyVariables>
}

const proseShortcutModules = [
	['prose-paragraphs', proseParagraphsStyle],
	['prose-links', proseLinksStyle],
	['prose-emphasis', proseEmphasisStyle],
	['prose-kbd', proseKbdStyle],
	['prose-lists', proseListsStyle],
	['prose-hr', proseHrStyle],
	['prose-headings', proseHeadingsStyle],
	['prose-quotes', proseQuotesStyle],
	['prose-media', proseMediaStyle],
	['prose-code', proseCodeStyle],
	['prose-tables', proseTablesStyle],
] as const

const proseSizeVariants = {
	'sm': { fontSize: '0.875rem', lineHeight: '1.71' },
	'lg': { fontSize: '1.125rem', lineHeight: '1.77' },
	'xl': { fontSize: '1.25rem', lineHeight: '1.8' },
	'2xl': { fontSize: '1.5rem', lineHeight: '1.66' },
} as const

function registerTypographyShortcuts(engine: Parameters<NonNullable<EnginePlugin['configureEngine']>>[0]) {
	engine.shortcuts.add(['prose-base', proseBaseStyle])

	proseShortcutModules.forEach(([name, style]) => {
		engine.shortcuts.add([name, ['prose-base', style]])
	})

	engine.shortcuts.add([
		'prose',
		proseShortcutModules.map(([name]) => name),
	])

	Object.entries(proseSizeVariants)
		.forEach(([size, overrides]) => {
			engine.shortcuts.add([
				`prose-${size}`,
				['prose', overrides],
			])
		})
}

declare module '@pikacss/core' {
	interface EngineConfig {
		/**
		 * Typography plugin options forwarded from the engine config.
		 *
		 * @default `undefined`
		 */
		typography?: TypographyPluginOptions
	}
}

/**
 * Creates the PikaCSS typography engine plugin.
 *
 * @returns An engine plugin that registers prose CSS variables and shortcut
 * utilities (`prose`, `prose-sm`, `prose-lg`, `prose-xl`, `prose-2xl`).
 *
 * @remarks The plugin reads the `typography` key from the engine config,
 * merges user-provided variable overrides with the defaults, and registers
 * a full set of typography shortcuts covering paragraphs, links, headings,
 * lists, code, tables, and more.
 *
 * @example
 * ```ts
 * import { typography } from '@pikacss/plugin-typography'
 *
 * export default defineEngineConfig({
 *   plugins: [typography()],
 *   typography: {
 *     variables: { '--pk-prose-color-links': '#3b82f6' },
 *   },
 * })
 * ```
 */
export function typography(): EnginePlugin {
	// The plugin object is a reusable definition (#116): the resolved options
	// are engine-local data, so they live in `context.state` rather than this
	// factory closure, which every engine reusing this definition shares.
	return defineEnginePlugin({
		name: 'typography',
		createState: () => ({
			typographyConfig: {} as TypographyPluginOptions,
		}),
		configureRawConfig: (config, context) => {
			if (config.typography)
				context.state.typographyConfig = config.typography
		},
		configureEngine: async (engine, context) => {
			// Add variables
			engine.variables.add({
				...typographyVariables,
				...context.state.typographyConfig.variables,
			})

			registerTypographyShortcuts(engine)
		},
	})
}
