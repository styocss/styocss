import type { Nullish, PreflightDefinition, ResolvedCSSProperties } from '../types'
import { defineEnginePlugin } from '../plugin'
import { addToSet } from '../utils'

/**
 * Describes the progress stops of a CSS `@keyframes` animation.
 *
 * @remarks Accepts the named stops `from` and `to`, plus any percentage-based stop in the form `"N%"`. Each stop maps to a set of CSS properties applied at that point in the animation.
 *
 * @example
 * ```ts
 * const progress: KeyframesProgress = {
 *   from: { opacity: '0' },
 *   '50%': { opacity: '0.5' },
 *   to: { opacity: '1' },
 * }
 * ```
 */
export interface KeyframesProgress {
	/**
	 * CSS properties applied at the start of the animation.
	 *
	 * @default undefined
	 */
	from?: ResolvedCSSProperties
	/**
	 * CSS properties applied at the end of the animation.
	 *
	 * @default undefined
	 */
	to?: ResolvedCSSProperties
	[K: `${number}%`]: ResolvedCSSProperties
}

/**
 * User-facing keyframes configuration. Accepts a name-only string, a tuple shorthand, or an object form.
 *
 * @remarks
 * - **String**: registers the name for autocomplete without defining animation frames.
 * - **Tuple `[name, frames?, autocomplete?, pruneUnused?]`**: concise shorthand.
 * - **Object `{ name, frames?, autocomplete?, pruneUnused? }`**: explicit form.
 *
 * @example
 * ```ts
 * const kf: Keyframes[] = [
 *   'spin',
 *   ['fade-in', { from: { opacity: '0' }, to: { opacity: '1' } }],
 * ]
 * ```
 */
export type Keyframes
	= | string
		| [name: string, frames?: KeyframesProgress, autocomplete?: string[], pruneUnused?: boolean]
		| { name: string, frames?: KeyframesProgress, autocomplete?: string[], pruneUnused?: boolean }

/**
 * Configuration object for the `keyframes` engine option.
 *
 * @remarks Passed via `EngineConfig.keyframes` to register `@keyframes` definitions at engine creation time.
 *
 * @example
 * ```ts
 * const config: KeyframesConfig = {
 *   definitions: [['spin', { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } }]],
 *   pruneUnused: true,
 * }
 * ```
 */
export interface KeyframesConfig {
	/** Array of keyframes definitions to register. */
	definitions: Keyframes[]

	/**
	 * Default pruning policy for keyframes that are not referenced by any `animation` or `animation-name` atomic style.
	 *
	 * @default true
	 */
	pruneUnused?: boolean
}

declare module '@pikacss/core' {
	interface EngineConfig {
		/**
		 * Keyframes definitions configuration.
		 *
		 * @default undefined
		 */
		keyframes?: KeyframesConfig
	}

	interface Engine {
		/** Runtime keyframes management: resolved keyframes store and `add` method for registering keyframes after engine creation. */
		keyframes: {
			store: Map<string, ResolvedKeyframesConfig>
			add: (...list: Keyframes[]) => void
		}
	}
}

/**
 * Built-in engine plugin that provides CSS `@keyframes` registration, autocomplete integration, and smart pruning.
 *
 * @returns An `EnginePlugin` that registers keyframes definitions, wires up `animationName`/`animation` autocomplete entries, and emits a preflight containing only the `@keyframes` rules actually referenced by atomic styles.
 *
 * @remarks Reads `EngineConfig.keyframes` during `rawConfigConfigured` and attaches the `engine.keyframes` management interface during `configureEngine`. Unused keyframes are pruned from the output unless `pruneUnused: false` is set on the individual definition or globally.
 *
 * @example
 * ```ts
 * createEngine({ plugins: [keyframes()] })
 * ```
 */
export function keyframes() {
	let resolveKeyframesConfig: (config: Keyframes) => ResolvedKeyframesConfig
	let configList: Keyframes[]
	return defineEnginePlugin({
		name: 'core:keyframes',

		rawConfigConfigured(config) {
			resolveKeyframesConfig = createResolveConfigFn({
				pruneUnused: config.keyframes?.pruneUnused,
			})
			configList = config.keyframes?.definitions ?? []
		},
		configureEngine(configurator) {
			const engine = configurator.runtime
			// Register extra properties
			engine.keyframes = {
				store: new Map(),
				add: (...list) => {
					list.forEach((config) => {
						const resolved = resolveKeyframesConfig(config)
						const { name, frames, autocomplete: autocompleteAnimation } = resolved
						if (frames != null)
							engine.keyframes.store.set(name, resolved)

						engine.appendAutocomplete({
							cssProperties: {
								animationName: name,
								animation: autocompleteAnimation.length > 0
									? [`${name} `, ...autocompleteAnimation]
									: `${name} `,
							},
						})
					})
					engine.notifyPreflightUpdated()
				},
			}

			// Add keyframes from config
			engine.keyframes.add(...configList)

			// Add preflight
			engine.addPreflight((engine, _isFormatted, ctx) => {
				const maybeUsedName = new Set<string>()
				// When the render pass scopes usage to specific atomic style ids,
				// ignore the rest of the append-only store so stale styles do not
				// keep keyframes alive.
				engine.store.atomicStyles.forEach(({ content: { property, value } }, id) => {
					if (ctx?.usedAtomicStyleIds != null && ctx.usedAtomicStyleIds.has(id) === false)
						return
					if (property === 'animation-name') {
						value.forEach(name => addToSet(maybeUsedName, ...name.split(',')
							.map(v => v.trim())))
						return
					}

					if (property === 'animation') {
						value.forEach((value) => {
							const animations = value.split(',')
								.map(v => v.trim())
							animations.forEach((animation) => {
								addToSet(maybeUsedName, ...animation.split(' '))
							})
						})
					}
				})
				const maybeUsedKeyframes = Array.from(engine.keyframes.store.values())
					.filter(({ name, frames, pruneUnused }) => ((pruneUnused === false) || maybeUsedName.has(name)) && frames != null)
				const preflightDefinition: Record<string, unknown> = {}
				maybeUsedKeyframes.forEach(({ name, frames }) => {
					// The renderer only reads the definition tree, so the stored
					// frames object can be referenced directly without cloning.
					preflightDefinition[`@keyframes ${name}`] = frames!
				})

				return preflightDefinition as PreflightDefinition
			})
		},
	})
}

interface ResolvedKeyframesConfig {
	name: string
	frames: KeyframesProgress | Nullish
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
