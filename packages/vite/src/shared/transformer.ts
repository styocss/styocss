import type { StyoEngine } from '@styocss/core'
import MagicString from 'magic-string'
import type { StyoPluginContext } from '../shared/types'

function findFunctionCallPositions(code: string, RE: RegExp) {
	const functionCallPositions: { fnName: string, start: number, end: number }[] = []
	let match: RegExpExecArray | null = RE.exec(code)

	while (match != null) {
		const fnName = match[1]!
		const start = match.index
		let end = start + fnName.length
		let depth = 1
		let inString: '\'' | '"' | false = false
		while (depth > 0) {
			end++
			if (inString === false && code[end] === '(')
				depth++
			else if (inString === false && code[end] === ')')
				depth--
			else if (inString === false && (code[end] === '\'' || code[end] === '"'))
				inString = code[end] as '\'' | '"'
			else if (inString === code[end])
				inString = false
		}
		functionCallPositions.push({ fnName, start, end })
		match = RE.exec(code)
	}

	return functionCallPositions
}

export function createFunctionCallTransformer(ctx: StyoPluginContext) {
	// eslint-disable-next-line style/newline-per-chained-call
	const RE = new RegExp(`\\b(${Object.values(ctx.styoFnNames).map(s => `(${s})`).join('|')})\\(`, 'g')

	return async function transformFunctionCalls(code: string, id: string) {
		if (!ctx.needToTransform(id))
			return

		ctx.usages.delete(id)

		// Find all target function calls
		const functionCallPositions = findFunctionCallPositions(code, RE)

		if (functionCallPositions.length === 0)
			return

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

			let transformedContent: string
			if (pos.fnName === ctx.styoFnNames.normal || pos.fnName === ctx.styoFnNames.normalpreview) {
				transformedContent = ctx.transformedFormat === 'array'
					? `[${names.map(n => `'${n}'`).join(', ')}]`
					: ctx.transformedFormat === 'string'
						? `'${names.join(' ')}'`
						: names.join(' ')
			}
			else if (pos.fnName === ctx.styoFnNames.forceString || pos.fnName === ctx.styoFnNames.forceStringPreview) {
				transformedContent = `'${names.join(' ')}'`
			}
			else if (pos.fnName === ctx.styoFnNames.forceArray || pos.fnName === ctx.styoFnNames.forceArrayPreview) {
				transformedContent = `[${names.map(n => `'${n}'`).join(', ')}]`
			}
			else if (pos.fnName === ctx.styoFnNames.forceInline || pos.fnName === ctx.styoFnNames.forceInlinePreview) {
				transformedContent = names.join(' ')
			}
			else {
				throw new Error(`Unexpected function name: ${pos.fnName}`)
			}

			transformed.update(pos.start, pos.end + 1, transformedContent)
		}

		return {
			code: transformed.toString(),
			map: transformed.generateMap({ hires: true }),
		}
	}
}
