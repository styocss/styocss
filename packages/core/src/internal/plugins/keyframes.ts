import type { Frames, KeyframesConfig } from '../types'
import { defineEnginePlugin } from '../plugin'
import { appendAutocompleteCssPropertyValues, isNotNullish } from '../utils'

interface ResolvedKeyframesConfig {
	name: string
	frames: Frames | null | undefined
	autocomplete: string[]
}

function resolveKeyframesConfig(config: KeyframesConfig): ResolvedKeyframesConfig {
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

		beforeConfigResolving(config) {
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
			appendAutocompleteCssPropertyValues(resolvedConfig, 'animationName', ...autocomplete.animationName)
			appendAutocompleteCssPropertyValues(resolvedConfig, 'animation', ...autocomplete.animation)
			resolvedConfig.preflights.push((engine) => {
				const used = new Set<string>()
				engine.store.atomicRules.forEach(({ content: { property, value } }) => {
					if (property === 'animationName') {
						value.forEach(name => used.add(name))
					}
					else if (property === 'animation') {
						value.forEach((value) => {
							const animations = value.split(',').map(v => v.trim())
							animations.forEach((animation) => {
								const name = animation.split(' ')[0]
								if (isNotNullish(name))
									used.add(name)
							})
						})
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
