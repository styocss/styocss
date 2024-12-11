import type { StyleItem } from '../types'
import { AbstractResolver, type DynamicRule, type StaticRule } from './abstract'

export type StaticShortcutRule = StaticRule<StyleItem[]>

export type DynamicShortcutRule = DynamicRule<StyleItem[]>

export class ShortcutResolver extends AbstractResolver<StyleItem[]> {
	resolve(shortcut: string): StyleItem[] {
		const resolved = this._resolve(shortcut)
		if (resolved == null)
			return [shortcut]

		const result = resolved.value.flatMap((partial) => {
			if (typeof partial === 'string')
				return this.resolve(partial) || []

			return partial
		})
		this._setResolvedResult(shortcut, result)

		return result
	}
}
