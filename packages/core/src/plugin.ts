import type { EngineConfig, ResolvedEngineConfig } from './config'
import type { Arrayable, Autocomplete, Awaitable } from './types'

export interface EnginePlugin<
	Autocomplete_ extends Autocomplete = Autocomplete,
	Name extends string = string,
> {
	name: Name

	config?: ((config: EngineConfig<Autocomplete_>) => Awaitable<void>) | undefined

	configResolved?: ((resolvedConfig: ResolvedEngineConfig<Autocomplete_>) => Awaitable<void>) | undefined
}

export async function resolvePlugins<Autocomplete_ extends Autocomplete = Autocomplete>(plugins: Awaitable<Arrayable<EnginePlugin<Autocomplete_>>>[]) {
	const result: EnginePlugin<Autocomplete_>[] = []
	for (const plugin of plugins) {
		result.push(...[await plugin].flat())
	}
	return result
}

type PluginMethod<Autocomplete_ extends Autocomplete = Autocomplete> = keyof Omit<EnginePlugin<Autocomplete_>, 'name'>

export async function executePlugins<
	Autocomplete_ extends Autocomplete = Autocomplete,
	M extends PluginMethod<Autocomplete_> = PluginMethod<Autocomplete_>,
>(
	plugins: Omit<EnginePlugin<Autocomplete_>, 'name'>[],
	method: M,
	...args: Parameters<NonNullable<EnginePlugin<Autocomplete_>[M]>>
): Promise<void> {
	for (const plugin of plugins) {
		const fn = plugin[method] as ((...args: any[]) => Awaitable<void>) | undefined
		await fn?.(...args)
	}
}

export function defineEnginePlugin<Autocomplete_ extends Autocomplete = Autocomplete>(plugin: EnginePlugin<Autocomplete_>) {
	return plugin
}
