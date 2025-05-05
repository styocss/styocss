import type { Engine, EngineConfig, Nullish } from '@pikacss/core'
import type { FnUtils, IntegrationContext, IntegrationContextOptions, UsageRecord } from './types'
import { statSync } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { createEngine, setWarnFn, warn } from '@pikacss/core'
import { createJiti } from 'jiti'
import { isPackageExists } from 'local-pkg'
import MagicString from 'magic-string'
import micromatch from 'micromatch'
import { dirname, isAbsolute, join, relative, resolve } from 'pathe'
import { createEventHook } from './eventHook'
import { generateTsCodegenContent } from './tsCodegen'

function findFunctionCalls(code: string, RE: RegExp) {
	const result: { fnName: string, start: number, end: number, snippet: string }[] = []
	let matched: RegExpExecArray | Nullish = RE.exec(code)

	while (matched != null) {
		const fnName = matched[1]!
		const start = matched.index
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
		const snippet = code.slice(start, end + 1)
		result.push({ fnName, start, end, snippet })
		matched = RE.exec(code)
	}

	return result
}

const ESCAPE_REPLACE_RE = /[.*+?^${}()|[\]\\/]/g

function createFnUtils(fnName: string): FnUtils {
	const available = {
		normal: new Set([fnName]),
		forceString: new Set([`${fnName}.str`, `${fnName}['str']`, `${fnName}["str"]`, `${fnName}[\`str\`]`]),
		forceArray: new Set([`${fnName}.arr`, `${fnName}['arr']`, `${fnName}["arr"]`, `${fnName}[\`arr\`]`]),
		forceInline: new Set([`${fnName}.inl`, `${fnName}['inl']`, `${fnName}["inl"]`, `${fnName}[\`inl\`]`]),
		// preview
		normalPreview: new Set([`${fnName}p`]),
		forceStringPreview: new Set([`${fnName}p.str`, `${fnName}p['str']`, `${fnName}p["str"]`, `${fnName}p[\`str\`]`]),
		forceArrayPreview: new Set([`${fnName}p.arr`, `${fnName}p['arr']`, `${fnName}p["arr"]`, `${fnName}p[\`arr\`]`]),
		forceInlinePreview: new Set([`${fnName}p.inl`, `${fnName}p['inl']`, `${fnName}p["inl"]`, `${fnName}p[\`inl\`]`]),
	}
	// eslint-disable-next-line style/newline-per-chained-call
	const RE = new RegExp(`\\b(${Object.values(available).flatMap(s => [...s].map(f => `(${f.replace(ESCAPE_REPLACE_RE, '\\$&')})`)).join('|')})\\(`, 'g')

	return {
		isNormal: (fnName: string) => available.normal.has(fnName) || available.normalPreview.has(fnName),
		isForceString: (fnName: string) => available.forceString.has(fnName) || available.forceStringPreview.has(fnName),
		isForceArray: (fnName: string) => available.forceArray.has(fnName) || available.forceArrayPreview.has(fnName),
		isForceInline: (fnName: string) => available.forceInline.has(fnName) || available.forceInlinePreview.has(fnName),
		isPreview: (fnName: string) => available.normalPreview.has(fnName) || available.forceStringPreview.has(fnName) || available.forceArrayPreview.has(fnName) || available.forceInlinePreview.has(fnName),
		RE,
	}
}

export async function createCtx(options: IntegrationContextOptions) {
	const {
		cwd,
		currentPackageName,
		target,
		configOrPath,
		fnName,
		transformedFormat,
		tsCodegen,
		devCss,
		autoCreateConfig,
	} = options

	setWarnFn((...args: any[]) => {
		console.warn(`[${currentPackageName}]`, ...args)
	})

	const devCssFilepath = isAbsolute(devCss) ? resolve(devCss) : join(cwd, devCss)
	const tsCodegenFilepath = tsCodegen === false ? null : (isAbsolute(tsCodegen) ? resolve(tsCodegen) : join(cwd, tsCodegen))

	const inlineConfig = typeof configOrPath === 'object' ? configOrPath : null
	const specificConfigPath = typeof configOrPath === 'string'
		? (isAbsolute(configOrPath) ? configOrPath : join(cwd, configOrPath))
		: null
	const configSources = [
		...specificConfigPath == null ? [] : [specificConfigPath],
		...['pika', 'pikacss']
			.flatMap(name => ['js', 'ts', 'cjs', 'cts', 'mjs', 'mts']
				.map(ext => `${name}.config.${ext}`))
			.map(name => join(cwd, name)),
	]

	const targetREs = target.map(t => micromatch.makeRe(t))
	const needToTransform = (id: string) => targetREs.some(re => re.test(id))

	const ctx: IntegrationContext = {
		cwd,
		currentPackageName,
		fnName,
		fnUtils: createFnUtils(fnName),
		transformedFormat,
		devCssFilepath,
		tsCodegenFilepath,
		hasVue: isPackageExists('vue', { paths: [cwd] }),
		usages: new Map(),
		hooks: {
			styleUpdated: createEventHook(),
			tsCodegenUpdated: createEventHook(),
		},
		loadConfig: async () => {
			if (inlineConfig != null)
				return { config: inlineConfig, file: null }

			let resolvedConfigPath = configSources.find((path) => {
				const stat = statSync(path, { throwIfNoEntry: false })
				return stat != null && stat.isFile()
			})

			if (resolvedConfigPath == null) {
				if (autoCreateConfig === false)
					return { config: null, file: null }

				resolvedConfigPath = configSources[0]!
				await mkdir(dirname(resolvedConfigPath), { recursive: true }).catch(() => {})
				const relativeTsCodegenFilepath = tsCodegenFilepath == null
					? null
					: `./${relative(dirname(resolvedConfigPath), tsCodegenFilepath)}`
				await writeFile(resolvedConfigPath, [
					...relativeTsCodegenFilepath == null
						? []
						: [`/// <reference path="${relativeTsCodegenFilepath}" />`],
					`import { defineEngineConfig } from '${currentPackageName}'`,
					'',
					'export default defineEngineConfig({',
					'  // Add your PikaCSS engine config here',
					'})',
				].join('\n'))
			}

			const jiti = createJiti(cwd, {
				fsCache: false,
				moduleCache: false,
			})
			const config = await jiti.import<EngineConfig>(resolvedConfigPath, { default: true })
			return { config, file: resolvedConfigPath }
		},
		init: async () => {
			ctx.isReady = false

			ctx.usages.clear()
			const { config, file } = await ctx.loadConfig()
				.catch((error) => {
					warn(`Failed to load config file:  ${error.message}`, error)
					return { config: null, file: null }
				})
			ctx.resolvedConfigPath = file
			try {
				ctx.engine = await createEngine(config ?? {})
			}
			catch (error: any) {
				warn(`Failed to create engine: ${error.message}. Maybe the config file is invalid, falling back to default config.`, error)
				ctx.engine = await createEngine({})
			}
			ctx.engine.config.plugins.unshift(({
				name: '@pikacss/integration:dev',
				preflightUpdated: () => ctx.hooks.styleUpdated.trigger(),
				atomicStyleAdded: () => ctx.hooks.styleUpdated.trigger(),
				autocompleteConfigUpdated: () => ctx.hooks.tsCodegenUpdated.trigger(),
			}))

			// prepare files
			await mkdir(dirname(devCssFilepath), { recursive: true }).catch(() => {})
			const isDevCssFileExists = await stat(devCssFilepath)
				.then(stat => stat.isFile())
				.catch(() => false)
			if (isDevCssFileExists === false)
				await writeFile(devCssFilepath, '')

			if (tsCodegenFilepath != null) {
				await mkdir(dirname(tsCodegenFilepath), { recursive: true }).catch(() => {})
				const isGenTsFileExists = await stat(tsCodegenFilepath)
					.then(stat => stat.isFile())
					.catch(() => false)
				if (isGenTsFileExists === false) {
					const content = await generateTsCodegenContent(ctx)
					await writeFile(tsCodegenFilepath, content)
				}
			}

			ctx.isReady = true
		},
		isReady: false,
		configSources,
		resolvedConfigPath: null,
		engine: null!,
		transform: async (code, id) => {
			try {
				if (
					ctx.isReady === false
					|| !needToTransform(id)
				) {
					return
				}

				ctx.usages.delete(id)

				// Find all target function calls
				const functionCalls = findFunctionCalls(code, ctx.fnUtils.RE)

				if (functionCalls.length === 0)
					return

				const usages: UsageRecord[] = []
				ctx.usages.set(id, usages)

				const transformed = new MagicString(code)
				for (const fnCall of functionCalls) {
					const functionCallStr = fnCall.snippet
					const argsStr = `[${functionCallStr.slice(fnCall.fnName.length + 1, -1)}]`
					// eslint-disable-next-line no-new-func
					const args = new Function(`return ${argsStr}`)() as Parameters<Engine['use']>
					const names = await ctx.engine.use(...args)
					const usage: UsageRecord = {
						atomicStyleIds: names,
						params: args,
					}
					usages.push(usage)
					ctx.hooks.tsCodegenUpdated.trigger()

					let transformedContent: string
					if (ctx.fnUtils.isNormal(fnCall.fnName)) {
						transformedContent = ctx.transformedFormat === 'array'
							? `[${names.map(n => `'${n}'`).join(', ')}]`
							: ctx.transformedFormat === 'string'
								? `'${names.join(' ')}'`
								: names.join(' ')
					}
					else if (ctx.fnUtils.isForceString(fnCall.fnName)) {
						transformedContent = `'${names.join(' ')}'`
					}
					else if (ctx.fnUtils.isForceArray(fnCall.fnName)) {
						transformedContent = `[${names.map(n => `'${n}'`).join(', ')}]`
					}
					else if (ctx.fnUtils.isForceInline(fnCall.fnName)) {
						transformedContent = names.join(' ')
					}
					else {
						throw new Error(`Unexpected function name: ${fnCall.fnName}`)
					}

					transformed.update(fnCall.start, fnCall.end + 1, transformedContent)
				}

				return {
					code: transformed.toString(),
					map: transformed.generateMap({ hires: true }),
				}
			}
			catch (error: any) {
				warn(`Failed to transform code: ${error.message}`, error)
				return void 0
			}
		},
		writeDevCssFile: async () => {
			if (ctx.isReady === false)
				return

			const atomicStyleIds = [...new Set([...ctx.usages.values()].flatMap(i => [...new Set(i.flatMap(i => i.atomicStyleIds))]))]
			const css = [
				`/* Auto-generated by ${ctx.currentPackageName} */`,
				ctx.engine.renderPreflights(true),
				ctx.engine.renderAtomicStyles(true, { atomicStyleIds }),
			].join('\n').trim()

			await writeFile(ctx.devCssFilepath, css)
		},
		writeTsCodegenFile: async () => {
			if (ctx.isReady === false || ctx.tsCodegenFilepath == null)
				return

			const content = await generateTsCodegenContent(ctx)
			await writeFile(ctx.tsCodegenFilepath, content)
		},
	}

	await ctx.init()

	return ctx
}
