import type { UnpluginFactory } from 'unplugin'
import type { PluginOptions } from './types'
import { createRollupPlugin } from 'unplugin'
import { unpluginFactory } from './index'

export type { PluginOptions } from './types'
/**
 * PikaCSS plugin factory for Rollup.
 *
 * Wraps the shared PikaCSS unplugin factory into a Rollup-compatible
 * plugin. Accepts optional {@link PluginOptions} to select the project config
 * and root.
 *
 * @example
 * ```ts
 * import pikacss from '@pikacss/unplugin-pikacss/rollup'
 *
 * export default {
 *   plugins: [pikacss()],
 * }
 * ```
 */
export default createRollupPlugin(unpluginFactory as UnpluginFactory<PluginOptions | undefined>)
