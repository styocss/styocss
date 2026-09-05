/**
 * Accepted active values for a single font-provider option.
 *
 * @remarks Arrays are serialized as comma-separated values by the built-in stylesheet providers.
 */
export type FontsProviderOptionValue = string | number | boolean | Array<string | number | boolean>

/**
 * Config-time provider option map.
 *
 * @remarks `null` and `undefined` are deletion markers: after global defaults and per-font overrides are resolved, nullish keys are absent from the effective map passed to providers.
 */
export type FontsProviderOptions = Partial<Record<string, FontsProviderOptionValue | null>>

/**
 * Effective provider option map passed to provider execution after defaults, overrides, and deletion markers are resolved.
 */
export type EffectiveFontsProviderOptions = Partial<Record<string, FontsProviderOptionValue>>

export function resolveProviderOptions(
	globalOptions: FontsProviderOptions,
	fontOptions: FontsProviderOptions,
): EffectiveFontsProviderOptions {
	const resolved: EffectiveFontsProviderOptions = {}
	applyProviderOptions(resolved, globalOptions)
	applyProviderOptions(resolved, fontOptions)
	return resolved
}

function applyProviderOptions(target: EffectiveFontsProviderOptions, source: FontsProviderOptions) {
	for (const [key, value] of Object.entries(source)) {
		if (value == null) {
			delete target[key]
			continue
		}
		target[key] = Array.isArray(value) ? [...value] : value
	}
}

export function pickSupportedProviderOptions(
	options: EffectiveFontsProviderOptions,
	supportedOptionKeys: readonly string[],
): EffectiveFontsProviderOptions {
	const picked: EffectiveFontsProviderOptions = {}
	for (const key of supportedOptionKeys) {
		const value = options[key]
		if (value != null)
			picked[key] = value
	}
	return picked
}

export function serializeProviderOptionsIdentity(options: EffectiveFontsProviderOptions): string {
	return JSON.stringify(Object.keys(options)
		.sort()
		.map(key => [key, serializeProviderOptionIdentity(options[key]!)]))
}

function serializeProviderOptionIdentity(value: FontsProviderOptionValue): unknown {
	if (Array.isArray(value))
		return ['array', value.map(serializeProviderOptionPrimitiveIdentity)]
	return serializeProviderOptionPrimitiveIdentity(value)
}

function serializeProviderOptionPrimitiveIdentity(value: string | number | boolean): unknown {
	if (typeof value === 'number') {
		if (Number.isNaN(value))
			return ['number', 'NaN']
		if (Object.is(value, -0))
			return ['number', '-0']
		return ['number', String(value)]
	}
	return [typeof value, String(value)]
}
