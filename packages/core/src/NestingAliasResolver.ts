import { StringResolver } from './StringResolver'
import type {
	Arrayable,
	DynamicNestingAliasRule,
	StaticNestingAliasRule,
} from './types'
import { isArray } from './utils'

class NestingAliasResolver {
	private _abstractResolver = new StringResolver<Arrayable<string>[], StaticNestingAliasRule, DynamicNestingAliasRule>({
		adaptStaticRule: rule => ({
			key: rule.key,
			string: rule.alias,
			resolved: [rule.value].flat(1),
		}),
		adaptDynamicRule: rule => ({
			key: rule.key,
			stringPattern: rule.pattern,
			predefined: [rule.predefined].flat(1),
			createResolved: (...args) => [rule.createValue(...args)].flat(1),
		}),
	})

	get staticAliasRuleList() {
		return [...this._abstractResolver.staticRulesMap.values()]
	}

	get dynamicAliasRuleList() {
		return [...this._abstractResolver.dynamicRulesMap.values()]
	}

	addStaticAliasRule(staticAliasRule: StaticNestingAliasRule) {
		this._abstractResolver.addStaticRule(staticAliasRule)
	}

	removeStaticAliasRule(key: string) {
		this._abstractResolver.removeStaticRule(key)
	}

	addDynamicAliasRule(dynamicAliasRule: DynamicNestingAliasRule) {
		this._abstractResolver.addDynamicRule(dynamicAliasRule)
	}

	removeDynamicAliasRule(key: string) {
		this._abstractResolver.removeDynamicRule(key)
	}

	resolveAlias(alias: string): string[][] | undefined {
		const resolved = this._abstractResolver.resolve(alias)
		if (resolved == null)
			return undefined

		const result = resolved.value
		const finalResult: string[][] = []
		let hasDeeperResult = false
		result.forEach((maybeArray) => {
			// Multi level nesting should ignore alias
			if (isArray(maybeArray)) {
				finalResult.push(maybeArray)
				return
			}

			const deeperResult = this.resolveAlias(maybeArray)

			if (deeperResult != null) {
				hasDeeperResult = true
				finalResult.push(...deeperResult)
			}
			else {
				finalResult.push([maybeArray])
			}
		})

		if (!hasDeeperResult)
			this._abstractResolver.setResolvedResult(alias, finalResult)

		return finalResult
	}
}

export {
	NestingAliasResolver,
}
