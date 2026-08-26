import type { IconifyLoaderOptions } from '@iconify/utils'

const LOCAL_ICON_LOADER_SCOPE = Symbol('pikacss:icons-local-loader-scope')

interface ScopedIconifyLoaderOptions extends IconifyLoaderOptions {
	[LOCAL_ICON_LOADER_SCOPE]?: object
}

/** @internal */
export function attachLocalIconLoaderScope(options: IconifyLoaderOptions, scope: object): IconifyLoaderOptions {
	Object.defineProperty(options, LOCAL_ICON_LOADER_SCOPE, {
		value: scope,
		enumerable: false,
		configurable: false,
		writable: false,
	})
	return options
}

/** @internal */
export function getLocalIconLoaderScope(options: IconifyLoaderOptions): object | undefined {
	return (options as ScopedIconifyLoaderOptions)[LOCAL_ICON_LOADER_SCOPE]
}
