import type { NuxtModule } from '@nuxt/schema'
import type { PluginOptions } from '@pikacss/unplugin-pikacss/vite'
import { addPluginTemplate, addVitePlugin, defineNuxtModule } from '@nuxt/kit'
import { inspectPikaCSSProject, preparePikaCSS } from '@pikacss/unplugin-pikacss'
import PikaCSSVitePlugin from '@pikacss/unplugin-pikacss/vite'

/**
 * Configuration options for the PikaCSS Nuxt module.
 *
 * @remarks
 * The Nuxt module accepts only an explicit project config path. Nuxt supplies
 * the project root from `nuxt.options.rootDir` to the host adapter.
 *
 * @example
 * ```ts
 * // nuxt.config.ts
 * export default defineNuxtConfig({
 *   modules: ['@pikacss/nuxt-pikacss'],
 *   pikacss: {
 *     config: './pika.config.ts',
 *   },
 * })
 * ```
 */
export interface ModuleOptions {
	/** Explicit PikaCSS project config path resolved from Nuxt's project root. */
	config?: string
}

/**
 * PikaCSS Nuxt module.
 *
 * Integrates PikaCSS into a Nuxt application by registering a Vite plugin
 * (with `enforce: 'pre'`) and a Nuxt plugin template that imports the
 * generated `pika.css` stylesheet.
 *
 * Configure the optional project config path under the `pikacss` key in
 * `nuxt.config`. Nuxt always anchors the adapter at `nuxt.options.rootDir`;
 * source semantics and generated outputs remain owned by Integration.
 */
export default (defineNuxtModule<ModuleOptions>({
	meta: {
		name: 'pikacss',
		configKey: 'pikacss',
	},
	async setup(options, nuxt) {
		const project = await inspectPikaCSSProject({
			cwd: nuxt.options.rootDir,
			...(options.config == null ? {} : { config: options.config }),
		})

		nuxt.hook('prepare:types', async (payload) => {
			const prepared = await preparePikaCSS({
				cwd: nuxt.options.rootDir,
				...(options.config == null ? {} : { config: options.config }),
				host: { publicEntryModule: '@pikacss/nuxt-pikacss' },
			})
			const reference = { path: prepared.declarationPath }
			payload.references.push(reference)
			payload.nodeReferences.push(reference)
			payload.sharedReferences.push(reference)
		})
		if (project.authoringForm === 'single') {
			const cssModule = project.entries[0]!.cssModule
			addPluginTemplate({
				filename: 'pikacss.mjs',
				getContents() {
					return `import { defineNuxtPlugin } from '#imports';\nexport default defineNuxtPlugin(() => {});\nimport ${JSON.stringify(cssModule)}; `
				},
			})
		}

		// `options` is the kit-merged result of inline module options, layers,
		// and `nuxt.options.pikacss`; reading only `nuxt.options.pikacss` would
		// silently drop inline options.
		const resolvedOptions: PluginOptions = {
			// Nuxt sets the Vite root to `srcDir`; resolve config discovery, the
			// declaration output, and the internal `.pikacss/` runtime state
			// against the project root instead.
			cwd: nuxt.options.rootDir,
			...(options.config == null ? {} : { config: options.config }),
		}

		addVitePlugin({
			...PikaCSSVitePlugin(resolvedOptions),
			enforce: 'pre',
		})
	},
}) as NuxtModule<ModuleOptions>)

export * from '@pikacss/unplugin-pikacss'

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
