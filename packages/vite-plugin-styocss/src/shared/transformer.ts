import type { StyoInstance } from '@styocss/core'
import type { StyoPluginContext } from '../shared/types'

export async function extractArgs ({
  nameOfStyleFn,
  functionCallStr,
  normalizeArgsStr,
}: {
  nameOfStyleFn: string
  functionCallStr: string
  normalizeArgsStr: (argsStr: string) => Promise<string> | string
}) {
  const argsStr = `[${functionCallStr.slice(nameOfStyleFn.length + 1, -1)}]`
  const normalized = await normalizeArgsStr(argsStr)
  // eslint-disable-next-line no-new-func
  const args = new Function(`return ${normalized}`)() as Parameters<StyoInstance['style']>
  return args
}

export function findFunctionCallPositions ({
  code,
  nameOfStyleFn,
}: {
  code: string
  nameOfStyleFn: string
}) {
  const positions: [start: number, end: number][] = []
  const regex = new RegExp(`${nameOfStyleFn}\\(`, 'g')
  let match: RegExpExecArray | null = regex.exec(code)
  while (match !== null) {
    const start = match.index
    let end = start + nameOfStyleFn.length + 1
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
  nameOfStyleFn,
  autoJoin,
  functionCallPositions,
  styo,
  normalizeArgsStr,
}: {
  code: string
  nameOfStyleFn: string
  autoJoin: boolean
  functionCallPositions: [start: number, end: number][]
  styo: StyoInstance
  normalizeArgsStr: (argsStr: string) => Promise<string> | string
}) {
  let transformed = ''
  const allNames: string[] = []
  let cursor = 0
  for (const pos of functionCallPositions) {
    transformed += code.slice(cursor, pos[0])
    const functionCallStr = code.slice(pos[0], pos[1] + 1)
    const args = await extractArgs({
      nameOfStyleFn,
      functionCallStr,
      normalizeArgsStr,
    })
    const names = styo.style(...args)
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
      nameOfStyleFn: ctx.nameOfStyleFn,
    })

    if (functionCallPositions.length === 0) {
      ctx.activeAtomicStyoRulesMap.delete(id)
      return
    }

    const result = await transformCode({
      code,
      nameOfStyleFn: ctx.nameOfStyleFn,
      autoJoin: ctx.autoJoin,
      functionCallPositions,
      styo: ctx.styo,
      normalizeArgsStr: ctx.transformTsToJs,
    })

    ctx.activeAtomicStyoRulesMap.set(id, new Set(result.names))

    return result.code
  }
}
