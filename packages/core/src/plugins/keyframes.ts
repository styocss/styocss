import { appendAutocompletePropertyValues } from '../config'
import { defineEnginePlugin } from '../plugin'
import type { Autocomplete, Properties } from '../types'
import { isNotNullish } from '../utils'

interface Frames<Autocomplete_ extends Autocomplete = Autocomplete> {
	from: Properties<Autocomplete_['ExtraProperties'], Autocomplete_['Properties']>
	to: Properties<Autocomplete_['ExtraProperties'], Autocomplete_['Properties']>
	[K: `${number}%`]: Properties<Autocomplete_['ExtraProperties'], Autocomplete_['Properties']>
}

export type KeyframesConfig<Autocomplete_ extends Autocomplete = Autocomplete> =
	| string
	| [name: string, frames?: Frames<Autocomplete_>, autocomplete?: string[]]
	| { name: string, frames?: Frames<Autocomplete_>, autocomplete?: string[] }

export interface ResolvedKeyframesConfig<Autocomplete_ extends Autocomplete = Autocomplete> {
	name: string
	frames: Frames<Autocomplete_> | null | undefined
	autocomplete: string[]
}

function resolveKeyframesConfig<Autocomplete_ extends Autocomplete = Autocomplete>(config: KeyframesConfig<Autocomplete_>): ResolvedKeyframesConfig<Autocomplete_> {
	if (typeof config === 'string')
		return { name: config, frames: null, autocomplete: [] }
	if (Array.isArray(config)) {
		const [name, frames, autocomplete = []] = config
		return { name, frames, autocomplete }
	}
	const { name, frames, autocomplete = [] } = config
	return { name, frames, autocomplete }
}

export function keyframes() {
	const allKeyframes: Map</* name */ string, /* css */ string> = new Map()
	let configList: KeyframesConfig[]
	return defineEnginePlugin({
		name: 'core:keyframes',
		config(config) {
			configList = config.keyframes ?? []
		},
		configResolved(resolvedConfig) {
			const autocomplete = {
				animationName: [] as string[],
				animation: [] as string[],
			}
			configList.forEach((config) => {
				const { name, frames, autocomplete: autocompleteAnimation } = resolveKeyframesConfig(config)
				if (frames != null) {
					const css = [
						`@keyframes ${name}{`,
						...Object.entries(frames).map(([frame, properties]) =>
							// eslint-disable-next-line style/newline-per-chained-call
							`${frame}{${Object.entries(properties).map(([property, value]) => `${property}:${value}`).join(';')}}`),
						'}',
					].join('')
					allKeyframes.set(name, css)
				}
				autocomplete.animationName.push(name)
				autocomplete.animation.push(`${name} `)
				if (autocompleteAnimation != null)
					autocomplete.animation.push(...autocompleteAnimation)
			})
			appendAutocompletePropertyValues(resolvedConfig, 'animationName', ...autocomplete.animationName)
			appendAutocompletePropertyValues(resolvedConfig, 'animation', ...autocomplete.animation)
			resolvedConfig.preflights.push((engine) => {
				const used = new Set<string>()
				engine.store.atomicRules.forEach(({ content: { property, value } }) => {
					if (property === 'animationName') {
						[value].flat().forEach(name => used.add(name))
					}
					else if (property === 'animation') {
						[value].flat().map(v => v.split(' ')[0])
							.filter(isNotNullish)
							.forEach(name => used.add(name))
					}
				})
				const content = Array.from(allKeyframes.entries())
					.filter(([name]) => used.has(name))
					.map(([, css]) => css)
					.join('')
				return content
			})
		},
	})
}
