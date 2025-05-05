import type { Nullish, ResolvedProperties } from '../types'
import { defineEnginePlugin } from '../plugin'
import { isNotNullish, renderCSSStyleBlocks } from '../utils'

// #region KeyframesConfig
export interface Progress {
	from?: ResolvedProperties
	to?: ResolvedProperties
	[K: `${number}%`]: ResolvedProperties
}

export type Keyframes =
	| string
	| [name: string, frames?: Progress, autocomplete?: string[], pruneUnused?: boolean]
	| { name: string, frames?: Progress, autocomplete?: string[], pruneUnused?: boolean }

export interface KeyframesConfig {
	/**
	 * Define CSS @keyframes animations with support for frame definitions
	 * and autocomplete suggestions.
	 *
	 * @default []
	 * @example
	 * ```ts
	 * {
	 *   keyframes: [
	 *     // Basic animation
	 *     ['fade', {
	 *       from: { opacity: 0 },
	 *       to: { opacity: 1 }
	 *     }],
	 *     // With autocomplete suggestions
	 *     ['slide', {
	 *       from: { transform: 'translateX(-100%)' },
	 *       to: { transform: 'translateX(0)' }
	 *     }, ['slide 0.3s ease']]
	 *   ]
	 * }
	 * ```
	 */
	keyframes: Keyframes[]

	/**
	 * Whether to prune unused keyframes from the final CSS.
	 *
	 * @default true
	 */
	pruneUnused?: boolean
}
// #endregion KeyframesConfig

declare module '@pikacss/core' {
	interface EngineConfig {
		keyframes?: KeyframesConfig
	}

	interface Engine {
		keyframes: {
			store: Map<string, ResolvedKeyframesConfig>
			add: (...list: Keyframes[]) => void
		}
	}
}

export function keyframes() {
	let resolveKeyframesConfig: (config: Keyframes) => ResolvedKeyframesConfig
	let configList: Keyframes[]
	return defineEnginePlugin({
		name: 'core:keyframes',

		rawConfigConfigured(config) {
			resolveKeyframesConfig = createResolveConfigFn({
				pruneUnused: config.keyframes?.pruneUnused,
			})
			configList = config.keyframes?.keyframes ?? []
		},
		configureEngine(engine) {
			// Register extra properties
			engine.keyframes = {
				store: new Map(),
				add: (...list) => {
					list.forEach((config) => {
						const resolved = resolveKeyframesConfig(config)
						const { name, frames, autocomplete: autocompleteAnimation } = resolved
						if (frames != null)
							engine.keyframes.store.set(name, resolved)

						engine.appendAutocompleteCssPropertyValues('animationName', name)
						engine.appendAutocompleteCssPropertyValues('animation', `${name} `)
						if (autocompleteAnimation != null)
							engine.appendAutocompleteCssPropertyValues('animation', ...autocompleteAnimation)
					})
					engine.notifyPreflightUpdated()
				},
			}

			// Add keyframes from config
			engine.keyframes.add(...configList)

			// Add preflight
			engine.addPreflight((engine, isFormatted) => {
				const used = new Set<string>()
				engine.store.atomicStyles.forEach(({ content: { property, value } }) => {
					if (property === 'animationName') {
						value.forEach(name => used.add(name))
						return
					}

					if (property === 'animation') {
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

				return renderCSSStyleBlocks(
					new Map(Array.from(engine.keyframes.store.entries())
						.filter(([name]) => used.has(name))
						.map(([name, frames]) => [
							`@keyframes ${name}`,
							{
								properties: [],
								children: new Map(Object.entries(frames)
									.map(([frame, properties]) => [
										frame,
										{
											properties: Object.entries(properties)
												.filter(([_, value]) => isNotNullish(value))
												.flatMap(([property, value]) => {
													if (Array.isArray(value))
														return value.map(v => ({ property, value: String(v) }))
													return { property, value: String(value) }
												}),
										},
									])),
							},
						])),
					isFormatted,
				)
			})
		},
	})
}

interface ResolvedKeyframesConfig {
	name: string
	frames: Progress | Nullish
	pruneUnused: boolean
	autocomplete: string[]
}

function createResolveConfigFn({
	pruneUnused: defaultPruneUnused = true,
}: {
	pruneUnused?: boolean
} = {}) {
	return function resolveKeyframesConfig(config: Keyframes): ResolvedKeyframesConfig {
		if (typeof config === 'string')
			return { name: config, frames: null, autocomplete: [], pruneUnused: defaultPruneUnused }
		if (Array.isArray(config)) {
			const [name, frames, autocomplete = [], pruneUnused = defaultPruneUnused] = config
			return { name, frames, autocomplete, pruneUnused }
		}
		const { name, frames, autocomplete = [], pruneUnused = defaultPruneUnused } = config
		return { name, frames, autocomplete, pruneUnused }
	}
}
