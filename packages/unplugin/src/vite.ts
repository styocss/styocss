import type { UnpluginFactory } from 'unplugin'
import type { Plugin } from 'vite'
import type { PluginOptions } from './types'
import { createVitePlugin } from 'unplugin'
import { unpluginFactory } from './index'

export type { PluginOptions } from './types'
/**
 * PikaCSS plugin factory for Vite.
 *
 * Wraps the shared PikaCSS unplugin factory into a Vite-compatible plugin.
 * Accepts optional {@link PluginOptions} to select the project config and
 * root. Returns a standard Vite `Plugin`.
 * The plugin declares `enforce: 'pre'`, so PikaCSS template transforms run
 * before framework compiler plugins regardless of the user's `plugins` order.
 *
 * @example
 * ```ts
 * import pikacss from '@pikacss/unplugin-pikacss/vite'
 *
 * export default defineConfig({
 *   plugins: [pikacss()],
 * })
 * ```
 */
export default createVitePlugin(unpluginFactory as UnpluginFactory<PluginOptions | undefined>) as any as (options?: PluginOptions) => Plugin
