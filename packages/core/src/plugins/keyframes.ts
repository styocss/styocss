import type { Arrayable, InternalPropertyValue, PreflightDefinition, ResolvedCSSProperties } from '../types'
import { normalizeValue } from '../extractor'
import { defineEnginePlugin } from '../plugin'
import { renderTypegenJSDoc } from '../typegen/jsdoc'
import { addToSet, toKebab } from '../utils'

/** Describes the progress stops of a CSS `@keyframes` animation. */
export interface KeyframesProgress {
	/**
	 * Declarations at the beginning of the animation.
	 * @default `undefined`
	 */
	from?: ResolvedCSSProperties
	/**
	 * Declarations at the end of the animation.
	 * @default `undefined`
	 */
	to?: ResolvedCSSProperties
	[K: `${number}%`]: ResolvedCSSProperties
}

/** Local keyframes emitted and optionally pruned by PikaCSS. */
export interface LocalKeyframesDefinition {
	/** Name used for the local `@keyframes` rule. */
	name: string
	/** CSS declarations grouped by animation progress stop. */
	frames: KeyframesProgress
	/**
	 * Additional values accepted for the `animation` property autocomplete.
	 * @default `[]`
	 */
	animationValues?: Arrayable<string>
	/**
	 * Documentation rendered for the generated Typegen keyframe member.
	 * @default `undefined`
	 */
	description?: string
	/**
	 * Whether this local keyframe is removed when no generated style uses it.
	 * @default `KeyframesConfig.pruneUnused`
	 */
	pruneUnused?: boolean
	/**
	 * Discriminator reserved for external keyframe definitions.
	 * @default `undefined`
	 */
	external?: never
}

/** External keyframes known to authoring but never emitted/pruned by PikaCSS. */
export interface ExternalKeyframesDefinition {
	/** Name of an externally defined `@keyframes` rule. */
	external: string
	/**
	 * Additional values accepted for the `animation` property autocomplete.
	 * @default `[]`
	 */
	animationValues?: Arrayable<string>
	/**
	 * Documentation rendered for the generated Typegen keyframe member.
	 * @default `undefined`
	 */
	description?: string
	/**
	 * Discriminator excluding local keyframe definitions.
	 * @default `undefined`
	 */
	name?: never
	/**
	 * Discriminator excluding local keyframe definitions.
	 * @default `undefined`
	 */
	frames?: never
	/**
	 * External keyframes are never pruned by PikaCSS.
	 * @default `undefined`
	 */
	pruneUnused?: never
}

/** Canonical object-only keyframes definition. */
export type Keyframes = LocalKeyframesDefinition | ExternalKeyframesDefinition

/** Configuration for the built-in keyframes subsystem. */
export interface KeyframesConfig {
	/** Local and external keyframe definitions available to the engine. */
	definitions: Keyframes[]
	/** Default pruning policy for local keyframes. @default true */
	pruneUnused?: boolean
}

declare module '@pikacss/core' {
	interface EngineConfig {
		/** Keyframe definitions consumed once during Engine initialization. */
		keyframes?: KeyframesConfig
	}
}

interface ResolvedKeyframesConfig {
	name: string
	frames?: KeyframesProgress
	pruneUnused: boolean
	animationValues: string[]
	description?: string
	external: boolean
}

interface KeyframesState {
	definitions: Keyframes[]
	defaultPruneUnused: boolean
	store: Map<string, ResolvedKeyframesConfig>
}

function resolveKeyframesConfig(config: Keyframes, defaultPruneUnused: boolean): ResolvedKeyframesConfig | undefined {
	if ('external' in config) {
		if (typeof config.external !== 'string' || config.external.trim().length === 0)
			return undefined
		return {
			name: config.external,
			animationValues: [config.animationValues ?? []].flat(),
			description: config.description,
			external: true,
			pruneUnused: false,
		}
	}
	if (typeof config.name !== 'string' || config.name.trim().length === 0 || config.frames == null)
		return undefined
	return {
		name: config.name,
		frames: config.frames,
		animationValues: [config.animationValues ?? []].flat(),
		description: config.description,
		external: false,
		pruneUnused: config.pruneUnused ?? defaultPruneUnused,
	}
}

function renderKeyframesPreview(name: string, frames: KeyframesProgress): string {
	const lines = [`@keyframes ${name} {`]
	for (const [stop, properties] of Object.entries(frames)) {
		lines.push(`  ${stop} {`)
		for (const [property, rawValue] of Object.entries(properties)) {
			const values = normalizeValue(rawValue as InternalPropertyValue) ?? []
			for (const value of values)
				lines.push(`    ${toKebab(property)}: ${value};`)
		}
		lines.push('  }')
	}
	lines.push('}')
	return lines.join('\n')
}

function renderKeyframesDeclarations(definitions: readonly ResolvedKeyframesConfig[]): string {
	const ordered = [...definitions].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
	const lines = ['interface __PikaKeyframes {']
	for (const definition of ordered) {
		lines.push(...renderTypegenJSDoc({
			description: definition.description,
			previewCss: definition.frames == null ? undefined : renderKeyframesPreview(definition.name, definition.frames),
		}, {}, '  '))
		lines.push(`  ${JSON.stringify(definition.name)}: ${JSON.stringify(definition.name)}`)
	}
	lines.push('}')

	const names = ordered.map(({ name }) => JSON.stringify(name))
	const animationValues = ordered.flatMap(({ name, animationValues }) => [name, ...animationValues])
		.filter((value, index, list) => list.indexOf(value) === index)
		.map(value => JSON.stringify(value))
	lines.push('interface __PikaKeyframePropertyValues {')
	lines.push(`  animationName: ${names.length === 0 ? 'never' : names.join(' | ')}`)
	lines.push(`  animation: ${animationValues.length === 0 ? 'never' : animationValues.join(' | ')}`)
	lines.push('}')
	return lines.join('\n')
}

/** Built-in keyframes subsystem with config-only semantic ingress. */
export function keyframes() {
	return defineEnginePlugin({
		name: 'core:keyframes',
		createState: (): KeyframesState => ({ definitions: [], defaultPruneUnused: true, store: new Map() }),
		rawConfigConfigured(config, context) {
			context.state.definitions = config.keyframes?.definitions ?? []
			context.state.defaultPruneUnused = config.keyframes?.pruneUnused ?? true
		},
		configureEngine(configurator) {
			const engine = configurator.runtime
			const resolved = configurator.state.definitions
				.map(definition => resolveKeyframesConfig(definition, configurator.state.defaultPruneUnused))
				.filter((definition): definition is ResolvedKeyframesConfig => definition != null)

			configurator.state.store.clear()
			for (const definition of resolved) {
				if (!definition.external)
					configurator.state.store.set(definition.name, definition)
			}

			const namespace = Object.freeze(Object.fromEntries(resolved.map(({ name }) => [name, name])))
			configurator.pika.extendStatic('kf', namespace)
			configurator.typegen.add({
				id: 'core:keyframes',
				declarations: renderKeyframesDeclarations(resolved),
				pika: { kf: '__PikaKeyframes' },
				cssPropertyValues: '__PikaKeyframePropertyValues',
			})

			const state = configurator.state
			engine.addPreflight((engine, _isFormatted, ctx) => {
				const maybeUsedName = new Set<string>()
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
							value.split(',')
								.map(v => v.trim())
								.forEach((animation) => {
									addToSet(maybeUsedName, ...animation.split(' '))
								})
						})
					}
				})

				const preflightDefinition: Record<string, unknown> = {}
				for (const { name, frames, pruneUnused } of state.store.values()) {
					if (frames == null || (pruneUnused !== false && !maybeUsedName.has(name)))
						continue
					preflightDefinition[`@keyframes ${name}`] = frames
				}
				return preflightDefinition as PreflightDefinition
			})
		},
	})
}
