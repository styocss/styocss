import type { UnpluginFactory } from 'unplugin'
import type { PluginOptions } from './types'
import { createWebpackPlugin } from 'unplugin'
import { unpluginFactory } from './index'

export type { PluginOptions } from './types'
/**
 * PikaCSS plugin factory for webpack.
 *
 * Wraps the shared PikaCSS unplugin factory into a webpack-compatible
 * plugin. Accepts optional {@link PluginOptions} to select the project config
 * and root.
 *
 * @param options - Optional project config path and host project root.
 *
 * @example
 * ```ts
 * import pikacss from '@pikacss/unplugin-pikacss/webpack'
 *
 * module.exports = {
 *   plugins: [pikacss()],
 * }
 * ```
 */
export default createWebpackPlugin(unpluginFactory as UnpluginFactory<PluginOptions | undefined>)
