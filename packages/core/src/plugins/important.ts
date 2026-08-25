import type { InternalPropertyValue, InternalStyleDefinition, Nullish } from '../types'
import { defineEnginePlugin } from '../plugin'
import { isPropertyValue } from '../utils'

/**
 * Configuration object for the `important` engine option.
 *
 * @example
 * ```ts
 * const config: ImportantConfig = { default: true }
 * ```
 */
export interface ImportantConfig {
	/**
	 * Whether `!important` is appended to every generated declaration by default.
	 *
	 * @default false
	 */
	default?: boolean
}

declare module '@pikacss/core' {
	interface EngineConfig {
		/**
		 * Controls the `!important` modifier on generated CSS declarations.
		 *
		 * @default undefined (no `!important` appended by default)
		 */
		important?: ImportantConfig
	}
}

// The CSS `!important` keyword is ASCII case-insensitive and may be followed
// by whitespace; whitespace is also allowed between `!` and `important`.
const TRAILING_IMPORTANT_RE = /!\s*important\s*$/i

function appendImportant(v: string | number): string {
	const value = String(v)
	return TRAILING_IMPORTANT_RE.test(value) ? value : `${value} !important`
}

function modifyPropertyValue(value: InternalPropertyValue): InternalPropertyValue {
	if (value == null)
		return null

	if (Array.isArray(value)) {
		return [appendImportant(value[0]), value[1].map(i => appendImportant(i))]
	}

	return appendImportant(value)
}

/**
 * Built-in engine plugin that appends `!important` to generated CSS declarations.
 *
 * @returns An `EnginePlugin` that intercepts `transformStyleDefinitions` to conditionally append `!important` to every property value.
 *
 * @remarks When `EngineConfig.important.default` is `true`, all property values receive `!important` unless the style definition explicitly sets `__important: false`. Individual style definitions can also opt-in with `__important: true` regardless of the default. An explicit `__important` flag is propagated into nested selector blocks (which may override it with their own explicit flag). The `__shortcut` reference is never modified.
 *
 * @example
 * ```ts
 * createEngine({ plugins: [important()] })
 * ```
 */
export function important() {
	let defaultValue: boolean

	function propagateExplicitFlag(v: unknown, flag: boolean): unknown {
		if (Array.isArray(v)) {
			// Style item list: propagate into object items, leave string references untouched.
			return v.map(item => (typeof item === 'object' && item !== null && !Array.isArray(item))
				? { __important: flag, ...item }
				: item)
		}
		// Nested style definition: inherit the flag unless it sets its own.
		return { __important: flag, ...(v as Record<string, unknown>) }
	}

	return defineEnginePlugin({
		name: 'core:important',

		rawConfigConfigured(config) {
			defaultValue = config.important?.default ?? false
		},
		configureEngine(configurator) {
			const engine = configurator.runtime
			engine.appendAutocomplete({
				extraProperties: '__important',
				properties: { __important: 'boolean' },
			})
		},
		transformStyleDefinitions(styleDefinitions) {
			return styleDefinitions.map<InternalStyleDefinition>((styleDefinition) => {
				const { __important, ...rest } = styleDefinition as Record<string, unknown> & { __important?: boolean | Nullish }
				const explicit = __important
				const important = explicit ?? defaultValue

				if (important === false && explicit == null)
					return rest as InternalStyleDefinition

				return Object.fromEntries(
					Object.entries(rest)
						.map(([k, v]) => {
							if (k === '__shortcut')
								return [k, v]

							if (isPropertyValue(v))
								return [k, important ? modifyPropertyValue(v) : v]

							return [k, explicit == null ? v : propagateExplicitFlag(v, explicit)]
						}) as any,
				) as InternalStyleDefinition
			})
		},
	})
}
