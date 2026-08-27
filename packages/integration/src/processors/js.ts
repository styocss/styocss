import type { JsDialect } from '../compiler/parse'
import type { AnalyzedModule, AnalyzedProjectModule, FrameworkProcessor, ProcessorOptions, ProcessorProjectOptions } from './types'
import { analyzeJs, analyzeJsProject } from '../compiler/analyze'

const EXTENSION_DIALECTS: Record<string, JsDialect> = {
	ts: 'ts',
	mts: 'ts',
	cts: 'ts',
	tsx: 'tsx',
	jsx: 'jsx',
}

/**
 * Maps a file extension to the {@link JsDialect} it is parsed as.
 *
 * @param ext - Lowercase extension without the leading dot.
 * @returns The dialect; unknown extensions fall back to `'js'`.
 */
export function dialectForExtension(ext: string): JsDialect {
	return EXTENSION_DIALECTS[ext] ?? 'js'
}

/**
 * The built-in JavaScript/TypeScript processor.
 *
 * @remarks
 * Emitted literals always use single quotes for JS sources (engine invariant:
 * the transformed output convention predates the AST compiler and is pinned by
 * regression tests).
 */
export const jsProcessor: FrameworkProcessor = {
	name: 'js',
	analyze(code: string, id: string, options: ProcessorOptions): AnalyzedModule {
		const ext = id.slice(id.lastIndexOf('.') + 1)
			.toLowerCase()
		const calls = analyzeJs(code, id, dialectForExtension(ext), options.fnConfig)
		return { fnName: options.fnConfig.fnName, id, code, calls }
	},
	analyzeProject(code: string, id: string, options: ProcessorProjectOptions): AnalyzedProjectModule {
		const ext = id.slice(id.lastIndexOf('.') + 1)
			.toLowerCase()
		const callsByRoot = analyzeJsProject(code, id, dialectForExtension(ext), options.fnNames)
		return {
			id,
			code,
			modules: new Map(options.fnNames.map(fnName => [fnName, {
				fnName,
				id,
				code,
				calls: callsByRoot.get(fnName)!,
			}])),
		}
	},
}
