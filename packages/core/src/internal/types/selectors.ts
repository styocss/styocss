import type { Arrayable, Awaitable, UnionString } from './utils'

export type SelectorConfig<_Selector extends string = string> =
	| string
	| [selector: RegExp, value: (matched: RegExpMatchArray) => Awaitable<Arrayable<UnionString | _Selector>>, autocomplete?: Arrayable<string>]
	| [selector: string, value: Arrayable<UnionString | _Selector>]
	| {
		selector: RegExp
		value: (matched: RegExpMatchArray) => Awaitable<Arrayable<UnionString | _Selector>>
		autocomplete?: Arrayable<string>
	}
	| {
		selector: string
		value: Arrayable<UnionString | _Selector>
	}
