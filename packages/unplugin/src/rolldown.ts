import type { UnpluginFactory } from 'unplugin'
import type { PluginOptions } from './types'
import { createRolldownPlugin } from 'unplugin'
import { unpluginFactory } from './index'

export type { PluginOptions } from './types'
/**
 * PikaCSS plugin factory for Rolldown.
 *
 * Wraps the shared PikaCSS unplugin factory into a Rolldown-compatible
 * plugin. Accepts optional {@link PluginOptions} to select the project config
 * and root.
 *
 * @param options - Optional project config path and host project root.
 *
 * @example
 * ```ts
 * import pikacss from '@pikacss/unplugin-pikacss/rolldown'
 *
 * export default {
 *   plugins: [pikacss()],
 * }
 * ```
 */
export default createRolldownPlugin(unpluginFactory as UnpluginFactory<PluginOptions | undefined>)
