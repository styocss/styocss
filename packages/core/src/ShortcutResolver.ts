import { isString } from './utils'
import { StringResolver } from './StringResolver'
import type {
	DynamicShortcutRule,
	ShortcutPartial,
	StaticShortcutRule,
	StyleGroup,
} from './types'

class ShortcutResolver {
	private _abstractResolver = new StringResolver<ShortcutPartial[], StaticShortcutRule, DynamicShortcutRule>({
		adaptStaticRule: rule => ({
			key: rule.key,
			string: rule.name,
			resolved: rule.partials,
		}),
		adaptDynamicRule: rule => ({
			key: rule.key,
			stringPattern: rule.pattern,
			predefined: [rule.predefined].flat(1),
			createResolved: rule.createPartials,
		}),
	})

	get staticShortcutRuleList() {
		return [...this._abstractResolver.staticRulesMap.values()]
	}

	get dynamicShortcutRuleList() {
		return [...this._abstractResolver.dynamicRulesMap.values()]
	}

	addStaticShortcutRule(staticShortcutRule: StaticShortcutRule) {
		this._abstractResolver.addStaticRule(staticShortcutRule)
	}

	removeStaticShortcutRule(key: string) {
		this._abstractResolver.removeStaticRule(key)
	}

	addDynamicShortcutRule(dynamicShortcutRule: DynamicShortcutRule) {
		this._abstractResolver.addDynamicRule(dynamicShortcutRule)
	}

	removeDynamicShortcutRule(key: string) {
		this._abstractResolver.removeDynamicRule(key)
	}

	private _allPartialsAreAtomicStyleGroups(partials: ShortcutPartial[]): partials is StyleGroup[] {
		return partials.every(partial => !isString(partial))
	}

	private _resolveShortcut(shortcut: string): ShortcutPartial[] {
		const resolved = this._abstractResolver.resolve(shortcut)
		if (resolved == null)
			return []

		const result = resolved.value

		if (this._allPartialsAreAtomicStyleGroups(result))
			return result

		const deeperResult = result
			.flatMap((partial) => {
				if (isString(partial))
					return this._resolveShortcut(partial)

				return partial
			})
		this._abstractResolver.setResolvedResult(shortcut, deeperResult)

		return deeperResult
	}

	resolveShortcut(shortcut: string): StyleGroup[] {
		const partials = this._resolveShortcut(shortcut)

		if (this._allPartialsAreAtomicStyleGroups(partials))
			return partials

		// Should never reach here
		return []
	}
}

export {
	ShortcutResolver,
}
