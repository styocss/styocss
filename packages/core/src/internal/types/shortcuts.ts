import type { StyleItem } from './shared'
import type { Arrayable, Awaitable } from './utils'

export type ShortcutConfig<_StyleItem = StyleItem> =
	| string
	| [shortcut: RegExp, value: (matched: RegExpMatchArray) => Awaitable<Arrayable<_StyleItem>>, autocomplete?: Arrayable<string>]
	| {
		shortcut: RegExp
		value: (matched: RegExpMatchArray) => Awaitable<Arrayable<_StyleItem>>
		autocomplete?: Arrayable<string>
	}
	| [shortcut: string, value: Arrayable<_StyleItem>]
	| {
		shortcut: string
		value: Arrayable<_StyleItem>
	}
