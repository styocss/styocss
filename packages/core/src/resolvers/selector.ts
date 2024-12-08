import { AbstractResolver, type DynamicRule, type StaticRule } from './abstract'

export type StaticSelectorRule = StaticRule<string[]>

export type DynamicSelectorRule = DynamicRule<string[]>

export class SelectorResolver extends AbstractResolver<string[]> {
	resolve(selector: string): string[] {
		const resolved = this._resolve(selector)
		if (resolved == null)
			return [selector]

		const result = resolved.value.flatMap(s => this.resolve(s))
		this._setResolvedResult(selector, result)

		return result
	}
}
