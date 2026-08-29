import type { UnpluginFactory } from 'unplugin'
import type { PluginOptions } from './types'
import { createRspackPlugin } from 'unplugin'
import { unpluginFactory } from './index'

export type { PluginOptions } from './types'
/**
 * PikaCSS plugin factory for Rspack.
 *
 * Wraps the shared PikaCSS unplugin factory into an Rspack-compatible
 * plugin. Accepts optional {@link PluginOptions} to select the project config
 * and root.
 *
 * @param options - Optional project config path and host project root.
 *
 * @example
 * ```ts
 * import pikacss from '@pikacss/unplugin-pikacss/rspack'
 *
 * module.exports = {
 *   plugins: [pikacss()],
 * }
 * ```
 */
export default createRspackPlugin(unpluginFactory as UnpluginFactory<PluginOptions | undefined>)
