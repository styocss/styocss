import type { DefinedPikaConfig, MultiProjectConfigOptions, MultiProjectEntryConfig, SingleProjectConfig } from './types'

const TRANSPORT = Symbol('pikacss.config.transport')

type RawTransport
	= | Readonly<{ authoringForm: 'single', config: SingleProjectConfig }>
		| Readonly<{ authoringForm: 'multi', entries: readonly MultiProjectEntryConfig[], options: MultiProjectConfigOptions }>

interface RuntimeTransport {
	readonly [TRANSPORT]: RawTransport
}

function createTransport(transport: RawTransport): DefinedPikaConfig {
	const wrapper = {}
	Object.defineProperty(wrapper, TRANSPORT, {
		value: Object.freeze(transport),
		enumerable: false,
		writable: false,
		configurable: false,
	})
	return Object.freeze(wrapper) as DefinedPikaConfig
}

/** @internal */
export function createSingleTransport(config: SingleProjectConfig): DefinedPikaConfig {
	return createTransport({ authoringForm: 'single', config })
}

/** @internal */
export function createMultiTransport(entries: readonly MultiProjectEntryConfig[], options: MultiProjectConfigOptions): DefinedPikaConfig {
	return createTransport({ authoringForm: 'multi', entries, options })
}

/** @internal */
export function readTransport(value: unknown): RawTransport | null {
	if (value == null || typeof value !== 'object')
		return null
	return (value as Partial<RuntimeTransport>)[TRANSPORT] ?? null
}
