import type { StyoEngine } from '@styocss/core'
import MagicString from 'magic-string'
import type { StyoPluginContext } from '../shared/types'

export function createFunctionCallTransformer(ctx: StyoPluginContext) {
	return async function transformFunctionCalls(code: string, id: string) {
		if (!ctx.needToTransform(id))
			return

		ctx.usages.delete(id)

		// Find all function calls
		const functionCallPositions: { fnName: string, start: number, end: number }[] = []
		const regex = new RegExp(`${ctx.nameOfStyoFn}p?\\(`, 'g')
		let match: RegExpExecArray | null = regex.exec(code)

		while (match != null) {
			const fnName = match[0]!.slice(0, -1)
			const start = match.index
			let end = start + fnName.length + 1
			let depth = 1
			while (depth > 0) {
				end++
				if (code[end] === '(')
					depth++
				else if (code[end] === ')')
					depth--
			}
			functionCallPositions.push({ fnName, start, end })
			match = regex.exec(code)
		}

		if (functionCallPositions.length === 0) {
			return
		}

		const usages: (Parameters<StyoEngine['styo']>)[] = []
		ctx.usages.set(id, usages)

		const transformed = new MagicString(code)
		for (const pos of functionCallPositions) {
			const functionCallStr = code.slice(pos.start, pos.end + 1)
			const argsStr = `[${functionCallStr.slice(pos.fnName.length + 1, -1)}]`
			const normalized = await ctx.transformTsToJs(argsStr)
			// eslint-disable-next-line no-new-func
			const args = new Function('fns', `return ${normalized}`)() as Parameters<StyoEngine['styo']>
			usages.push(args)
			const names = ctx.engine.styo(...args)
			const transformedNames = ctx.autoJoin ? `'${names.join(' ')}'` : `[${names.map(n => `'${n}'`).join(', ')}]`
			transformed.update(pos.start, pos.end + 1, transformedNames)
		}

		return {
			code: transformed.toString(),
			map: transformed.generateMap({ hires: true }),
		}
	}
}
