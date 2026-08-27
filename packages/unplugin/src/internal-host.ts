import type { PluginOptions } from './types'

/** Package-private host binding used by official wrappers such as Nuxt. */
export const PIKACSS_HOST_PUBLIC_ENTRY_MODULE = Symbol.for('@pikacss/unplugin-pikacss:public-entry-module')

/** Internal adapter options; the public PluginOptions surface remains cwd/config only. */
export type InternalPluginOptions = PluginOptions & {
	readonly [PIKACSS_HOST_PUBLIC_ENTRY_MODULE]?: string
}
