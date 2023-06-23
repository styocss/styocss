import type { StyoEngine } from '@styocss/core'
import type { StyoPluginContext } from '../shared/types'

export function createFunctionCallTransformer (ctx: StyoPluginContext) {
  return async function transformFunctionCalls (code: string, id: string) {
    if (!ctx.needToTransform(id))
      return

    // Find all function calls
    const functionCallPositions: [start: number, end: number][] = []
    const regex = new RegExp(`${ctx.nameOfStyoFn}\\(`, 'g')
    let match: RegExpExecArray | null = regex.exec(code)
    while (match !== null) {
      const start = match.index
      let end = start + ctx.nameOfStyoFn.length + 1
      let depth = 1
      while (depth > 0) {
        end++
        if (code[end] === '(')
          depth++
        else if (code[end] === ')')
          depth--
      }
      functionCallPositions.push([start, end])
      match = regex.exec(code)
    }

    if (functionCallPositions.length === 0)
      return

    let transformed = ''
    let cursor = 0
    for (const pos of functionCallPositions) {
      transformed += code.slice(cursor, pos[0])
      const functionCallStr = code.slice(pos[0], pos[1] + 1)
      const argsStr = `[${functionCallStr.slice(ctx.nameOfStyoFn.length + 1, -1)}]`
      const normalized = await ctx.transformTsToJs(argsStr)
      // eslint-disable-next-line no-new-func
      const args = new Function('fns', `return ${normalized}`)() as Parameters<StyoEngine['styo']>
      const names = ctx.engine.styo(...args)
      const transformedNames = ctx.autoJoin ? `'${names.join(' ')}'` : `[${names.map((n) => `'${n}'`).join(', ')}]`
      transformed += transformedNames
      cursor = pos[1] + 1
    }
    transformed += code.slice(cursor)

    return transformed
  }
}
