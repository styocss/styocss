import type { StyoEngine } from '@styocss/core'
import type { StyoPluginContext } from '../shared/types'

export async function extractArgs ({
  nameOfStyoFn,
  functionCallStr,
  normalizeArgsStr,
}: {
  nameOfStyoFn: string
  functionCallStr: string
  normalizeArgsStr: (argsStr: string) => Promise<string> | string
}) {
  const argsStr = `[${functionCallStr.slice(nameOfStyoFn.length + 1, -1)}]`
  const normalized = await normalizeArgsStr(argsStr)
  // eslint-disable-next-line no-new-func
  const args = new Function('fns', `return ${normalized}`)() as Parameters<StyoEngine['styo']>
  return args
}

export function findFunctionCallPositions ({
  code,
  nameOfStyoFn,
}: {
  code: string
  nameOfStyoFn: string
}) {
  const positions: [start: number, end: number][] = []
  const regex = new RegExp(`${nameOfStyoFn}\\(`, 'g')
  let match: RegExpExecArray | null = regex.exec(code)
  while (match !== null) {
    const start = match.index
    let end = start + nameOfStyoFn.length + 1
    let depth = 1
    while (depth > 0) {
      end++
      if (code[end] === '(')
        depth++
      else if (code[end] === ')')
        depth--
    }
    positions.push([start, end])
    match = regex.exec(code)
  }

  return positions
}

export async function transformCode ({
  code,
  nameOfStyoFn,
  autoJoin,
  functionCallPositions,
  styo,
  normalizeArgsStr,
}: {
  code: string
  nameOfStyoFn: string
  autoJoin: boolean
  functionCallPositions: [start: number, end: number][]
  styo: StyoEngine<string, string, string>
  normalizeArgsStr: (argsStr: string) => Promise<string> | string
}) {
  let transformed = ''
  const allNames: string[] = []
  let cursor = 0
  for (const pos of functionCallPositions) {
    transformed += code.slice(cursor, pos[0])
    const functionCallStr = code.slice(pos[0], pos[1] + 1)
    const args = await extractArgs({
      nameOfStyoFn,
      functionCallStr,
      normalizeArgsStr,
    })
    const names = styo.styo(...args)
    allNames.push(...names)
    const transformedNames = autoJoin ? `'${names.join(' ')}'` : `[${names.map((n) => `'${n}'`).join(', ')}]`
    transformed += transformedNames
    cursor = pos[1] + 1
  }
  transformed += code.slice(cursor)

  return {
    names: allNames,
    code: transformed,
  }
}

export function createFunctionCallTransformer (ctx: StyoPluginContext) {
  return async function transformFunctionCalls (code: string, id: string) {
    if (!ctx.needToTransform(id))
      return

    const functionCallPositions = findFunctionCallPositions({
      code,
      nameOfStyoFn: ctx.nameOfStyoFn,
    })

    if (functionCallPositions.length === 0)
      return

    const result = await transformCode({
      code,
      nameOfStyoFn: ctx.nameOfStyoFn,
      autoJoin: ctx.autoJoin,
      functionCallPositions,
      styo: ctx.engine,
      normalizeArgsStr: ctx.transformTsToJs,
    })

    return result.code
  }
}
