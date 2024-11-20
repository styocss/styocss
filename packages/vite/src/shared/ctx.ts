import { statSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import type { StyoEngine, StyoEngineConfig } from '@styocss/core'
import { createEventHook, createStyoEngine } from '@styocss/core'
import { dirname, isAbsolute, join, resolve } from 'pathe'
import { getPackageInfo, isPackageExists } from 'local-pkg'
import MagicString from 'magic-string'
import { createJiti } from 'jiti'
import * as prettier from 'prettier'
import { DEV_CSS_FILENAME, VIRTUAL_STYO_CSS_ID } from '../constants'
import type { CtxOptions, StyoPluginContext, StyoUsage } from './types'
import { generateDtsContent } from './dtsGenerator'

export function resolveId(id: string) {
	if (id === VIRTUAL_STYO_CSS_ID)
		return id

	return null
}

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

export async function createCtx(options: CtxOptions) {
	const {
		cwd,
		currentPackageName,
		extensions,
		configOrPath,
		styoFnName,
		transformedFormat,
		dts,
		transformTsToJs,
	} = options

	const devCssFilepath = join((await getPackageInfo(currentPackageName, { paths: [cwd] }))!.rootPath, '.temp', DEV_CSS_FILENAME)
	const dtsFilepath = dts === false ? null : (isAbsolute(dts) ? resolve(dts) : join(cwd, dts))

	const styoFnNames = {
		normal: styoFnName,
		normalPreview: `${styoFnName}p`,
		forceString: `${styoFnName}Str`,
		forceStringPreview: `${styoFnName}pStr`,
		forceArray: `${styoFnName}Arr`,
		forceArrayPreview: `${styoFnName}pArr`,
		forceInline: `${styoFnName}Inl`,
		forceInlinePreview: `${styoFnName}pInl`,
	}

	// eslint-disable-next-line style/newline-per-chained-call
	const fnRE = new RegExp(`\\b(${Object.values(styoFnNames).map(s => `(${s})`).join('|')})\\(`, 'g')

	// eslint-disable-next-line style/newline-per-chained-call
	const previewFns = new Set(Object.entries(styoFnNames).filter(([k]) => k.endsWith('Preview')).map(([_, v]) => v))

	const inlineConfig = typeof configOrPath === 'object' ? configOrPath : null
	const specificConfigPath = typeof configOrPath === 'string'
		? (isAbsolute(configOrPath) ? configOrPath : join(cwd, configOrPath))
		: null
	const configSources = [
		...specificConfigPath == null ? [] : [specificConfigPath],
		...['styo', 'styocss']
			.flatMap(name => ['js', 'ts', 'cjs', 'cts', 'mjs', 'mts']
				.map(ext => `${name}.config.${ext}`))
			.map(name => join(cwd, name)),
	]

	const needToTransform = (id: string) => extensions.some(ext => id.endsWith(ext))

	const ctx: StyoPluginContext = {
		cwd,
		currentPackageName,
		styoFnNames,
		transformedFormat,
		devCssFilepath,
		dtsFilepath,
		hasVue: isPackageExists('vue', { paths: [cwd] }),
		usages: new Map(),
		hooks: {
			styleUpdated: createEventHook(),
			dtsUpdated: createEventHook(),
		},
		loadConfig: async () => {
			if (inlineConfig != null)
				return { config: inlineConfig, file: null }

			const resolvedConfigPath = configSources.find((path) => {
				const stat = statSync(path, { throwIfNoEntry: false })
				return stat != null && stat.isFile()
			})

			if (resolvedConfigPath == null)
				return { config: null, file: null }

			const jiti = createJiti(cwd, {
				fsCache: false,
				moduleCache: false,
			})
			const config = await jiti.import<StyoEngineConfig>(resolvedConfigPath, { default: true })
			return { config, file: resolvedConfigPath }
		},
		init: async () => {
			ctx.isReady = false

			ctx.usages.clear()
			const { config, file } = await ctx.loadConfig()
			ctx.resolvedConfigPath = file
			ctx.engine = createStyoEngine(config ?? {})
			ctx.engine.hooks.atomicStyleAdded.on(() => ctx.hooks.styleUpdated.trigger())

			// prepare files
			await mkdir(dirname(devCssFilepath), { recursive: true }).catch(() => {})
			await writeFile(devCssFilepath, '')
			if (dtsFilepath != null) {
				await mkdir(dirname(dtsFilepath), { recursive: true }).catch(() => {})
				await writeFile(dtsFilepath, '')
			}

			ctx.isReady = true
		},
		isReady: false,
		configSources,
		resolvedConfigPath: null,
		engine: null!,
		transform: async (code, id) => {
			if (
				ctx.isReady === false
				|| !needToTransform(id)
			) {
				return
			}

			ctx.usages.delete(id)

			// Find all target function calls
			const functionCallPositions = findFunctionCallPositions(code, fnRE)

			if (functionCallPositions.length === 0)
				return

			const usages: StyoUsage[] = []
			ctx.usages.set(id, usages)

			const transformed = new MagicString(code)
			for (const pos of functionCallPositions) {
				const functionCallStr = code.slice(pos.start, pos.end + 1)
				const argsStr = `[${functionCallStr.slice(pos.fnName.length + 1, -1)}]`
				const normalized = await transformTsToJs(argsStr)
				// eslint-disable-next-line no-new-func
				const args = new Function(`return ${normalized}`)() as Parameters<StyoEngine['styo']>
				const usage = {
					isPreview: previewFns.has(pos.fnName),
					params: args,
				}
				usages.push(usage)
				const names = ctx.engine.styo(...args)
				ctx.hooks.dtsUpdated.trigger()

				let transformedContent: string
				if (pos.fnName === ctx.styoFnNames.normal || pos.fnName === ctx.styoFnNames.normalPreview) {
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
		},
		writeDevCssFile: async () => {
			if (ctx.isReady === false)
				return

			const css = await prettier.format(ctx.engine.renderStyles(), { parser: 'css' })
			await writeFile(ctx.devCssFilepath, css)
		},
		writeDtsFile: async () => {
			if (ctx.isReady === false || ctx.dtsFilepath == null)
				return

			const content = await generateDtsContent(ctx)
			await writeFile(ctx.dtsFilepath, content)
		},
	}

	await ctx.init()

	return ctx
}
