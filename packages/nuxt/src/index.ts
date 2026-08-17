import type { NuxtModule } from '@nuxt/schema'
import type { PluginOptions } from '@pikacss/unplugin-pikacss/vite'
import { addPluginTemplate, addVitePlugin, defineNuxtModule } from '@nuxt/kit'
import PikaCSSVitePlugin from '@pikacss/unplugin-pikacss/vite'

/**
 * Configuration options for the PikaCSS Nuxt module.
 *
 * @remarks
 * Mirrors the unplugin `PluginOptions` with `currentPackageName` omitted because
 * the Nuxt module supplies it automatically.
 *
 * @example
 * ```ts
 * // nuxt.config.ts
 * export default defineNuxtConfig({
 *   modules: ['@pikacss/nuxt-pikacss'],
 *   pikacss: {
 *     config: './pika.config.ts',
 *     scan: { include: ['**\/*.vue'] },
 *   },
 * })
 * ```
 */
export type ModuleOptions = Omit<PluginOptions, 'currentPackageName'>

/**
 * PikaCSS Nuxt module.
 *
 * Integrates PikaCSS into a Nuxt application by registering a Vite plugin
 * (with `enforce: 'pre'`) and a Nuxt plugin template that imports the
 * generated `pika.css` stylesheet.
 *
 * Configure options under the `pikacss` key in `nuxt.config`. When no
 * options are provided, the unplugin defaults apply: sources matching
 * `**\/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,vue}` are scanned, excluding
 * `node_modules`, `dist`, `.git`, `.nuxt`, `.output`, and `coverage`.
 */
export default (defineNuxtModule<ModuleOptions>({
	meta: {
		name: 'pikacss',
		configKey: 'pikacss',
	},
	async setup(options, nuxt) {
		addPluginTemplate({
			filename: 'pikacss.mjs',
			getContents() {
				return 'import { defineNuxtPlugin } from \'#imports\';\nexport default defineNuxtPlugin(() => {});\nimport "pika.css"; '
			},
		})

		// `options` is the kit-merged result of inline module options, layers,
		// and `nuxt.options.pikacss`; reading only `nuxt.options.pikacss` would
		// silently drop inline options.
		// No `scan` default is set here: the unplugin layer's own default
		// resolution (JS family plus Vue SFCs) is the single source of truth.
		const resolvedOptions: ModuleOptions = {
			// Nuxt sets the Vite root to `srcDir`; resolve config discovery, the
			// declaration output, and the internal `.pikacss/` runtime state
			// against the project root instead.
			cwd: nuxt.options.rootDir,
			...options,
		}

		addVitePlugin({
			...PikaCSSVitePlugin({
				currentPackageName: '@pikacss/nuxt-pikacss',
				...resolvedOptions,
			}),
			enforce: 'pre',
		})
	},
}) as NuxtModule<ModuleOptions>)

export * from '@pikacss/unplugin-pikacss/vite'

declare module '@nuxt/schema' {
	interface NuxtConfig {
		/**
		 * PikaCSS module options used during Nuxt configuration merging.
		 *
		 * @default `undefined`
		 */
		pikacss?: ModuleOptions
	}
	interface NuxtOptions {
		/**
		 * Resolved PikaCSS module options available at runtime on `nuxt.options`.
		 *
		 * @default `undefined`
		 */
		pikacss?: ModuleOptions
	}
}
