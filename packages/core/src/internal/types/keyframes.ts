import type { Properties } from './shared'

export interface Frames<_Properties = Properties> {
	from: _Properties
	to: _Properties
	[K: `${number}%`]: _Properties
}

export type KeyframesConfig<_Properties = Properties> =
	| string
	| [name: string, frames?: Frames<_Properties>, autocomplete?: string[]]
	| { name: string, frames?: Frames<_Properties>, autocomplete?: string[] }
