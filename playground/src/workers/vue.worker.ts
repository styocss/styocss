// Volar-based language worker for `.vue` SFCs (the pattern play.vuejs.org /
// @vue/repl uses, adapted to this playground). Registered for monaco label
// `vue` in MonacoEditor.vue and driven from useVueLanguageService.ts.
//
// TypeScript is bundled into this (lazy) worker chunk. node_modules types are
// NOT bundled — they come from the WebContainer's real installed node_modules
// through the `VueWorkerHost` RPC bridge (ctx.host), so the worker sees
// exactly what the template project has installed.
import type { SourceScript, VueCompilerOptions } from '@vue/language-core'
import type { LanguageService, LanguageServiceEnvironment } from '@vue/language-service'
import type { Requests } from '@vue/typescript-plugin/lib/requests'
import type * as monaco from 'monaco-editor'
import type * as tsTypes from 'typescript'
import type { VueWorkerCreateData, VueWorkerHost } from './vueWorkerShared'
import { createTypeScriptWorkerLanguageService } from '@volar/monaco/worker'
import { createVueLanguagePlugin, getDefaultCompilerOptions, VueVirtualCode } from '@vue/language-core'
import propsFallback from '@vue/language-core/types/props-fallback.d.ts?raw'
// The static global-types files the generated SFC code references via
// `/// <reference types="<typesRoot>/....d.ts" />` (vue-language-tools 3.3.x).
import templateHelpers from '@vue/language-core/types/template-helpers.d.ts?raw'
import vue34Shims from '@vue/language-core/types/vue-3.4-shims.d.ts?raw'
import { createVueLanguageServicePlugins } from '@vue/language-service'
import { postprocessLanguageService } from '@vue/typescript-plugin/lib/common'
import { getComponentDirectives } from '@vue/typescript-plugin/lib/requests/getComponentDirectives'
import { getComponentNames } from '@vue/typescript-plugin/lib/requests/getComponentNames'
import { getComponentProps } from '@vue/typescript-plugin/lib/requests/getComponentProps'
import { getComponentSlots } from '@vue/typescript-plugin/lib/requests/getComponentSlots'
import { getElementAttrs } from '@vue/typescript-plugin/lib/requests/getElementAttrs'
import { getElementNames } from '@vue/typescript-plugin/lib/requests/getElementNames'
import { isRefAtPosition } from '@vue/typescript-plugin/lib/requests/isRefAtPosition'
import { resolveModuleName } from '@vue/typescript-plugin/lib/requests/resolveModuleName'
import { initialize } from 'monaco-editor/editor/editor.worker.js'
import ts from 'typescript'
import { create as createTypeScriptDirectiveCommentPlugin } from 'volar-service-typescript/lib/plugins/directiveComment'
import { create as createTypeScriptSemanticPlugin } from 'volar-service-typescript/lib/plugins/semantic'
import { URI } from 'vscode-uri'

// Must live under a directory the FS bridge treats as immutable; the generated
// code computes a path relative to each SFC (e.g. ../node_modules/...).
const GLOBAL_TYPES_ROOT = '/node_modules/.vue-global-types'
const GLOBAL_TYPES_FILES = new Map<string, string>([
	[`${GLOBAL_TYPES_ROOT}/template-helpers.d.ts`, templateHelpers],
	[`${GLOBAL_TYPES_ROOT}/props-fallback.d.ts`, propsFallback],
	[`${GLOBAL_TYPES_ROOT}/vue-3.4-shims.d.ts`, vue34Shims],
])

// These service plugins need cross-thread features this setup does not
// implement (same exclusions as @vue/repl), plus the pug template plugin:
// volar-service-pug's browser stub returns a service instance without
// `provide`, which crashes vue-template (jade) at context creation — and no
// playground template uses pug.
const IGNORED_SERVICE_PLUGINS = new Set([
	'vue-extract-file',
	'vue-document-drop',
	'vue-document-highlights',
	'typescript-semantic-tokens',
	'vue-template (jade)',
])

function createEnv(host: VueWorkerHost): LanguageServiceEnvironment {
	return {
		workspaceFolders: [URI.file('/')],
		fs: {
			async stat(uri) {
				const path = uri.path
				if (GLOBAL_TYPES_FILES.has(path))
					return { type: 1, ctime: 0, mtime: 0, size: GLOBAL_TYPES_FILES.get(path)!.length }
				if (path === GLOBAL_TYPES_ROOT)
					return { type: 2, ctime: 0, mtime: 0, size: 0 }
				const stat = await host.fsStat(path)
				return stat ? { type: stat.type, ctime: 0, mtime: 0, size: 0 } : undefined
			},
			async readFile(uri) {
				const path = uri.path
				if (GLOBAL_TYPES_FILES.has(path))
					return GLOBAL_TYPES_FILES.get(path)
				return await host.fsReadFile(path) ?? undefined
			},
			async readDirectory(uri) {
				const path = uri.path
				if (path === GLOBAL_TYPES_ROOT)
					return [...GLOBAL_TYPES_FILES.keys()].map(p => [p.slice(GLOBAL_TYPES_ROOT.length + 1), 1])
				return await host.fsReadDirectory(path)
			},
		},
	}
}

/**
 * Raw (un-proxied) TS language service facade for the Requests client — set
 * when the semantic plugin instance is created. The request functions (e.g.
 * getComponentProps) call `getCompletionsAtPosition` with GENERATED-file
 * offsets and need the raw methods; the vue-aware postprocess proxies below
 * would mis-transform those calls and silently return nothing.
 */
let rawTsLanguageService: tsTypes.LanguageService | undefined

/**
 * `createVueLanguageServicePlugins` (3.3.x) does NOT include the TS *semantic*
 * plugin — without it there are no TS completions/hover/diagnostics at all.
 * Compose it like @vue/repl does: create it, then patch its language service
 * with the vue-aware method proxies (component auto-import in completions,
 * SFC-mapped definitions, ...).
 */
function createTsServicePlugins(vueCompilerOptions: VueCompilerOptions) {
	const semanticPlugin = createTypeScriptSemanticPlugin(ts)
	const { create } = semanticPlugin
	semanticPlugin.create = (context) => {
		const created = create(context)
		const languageService: tsTypes.LanguageService = (created.provide as any)['typescript/languageService']()
		const proxy = postprocessLanguageService(
			ts,
			context.language,
			languageService,
			vueCompilerOptions,
			fileName => URI.file(fileName),
		)
		const wrappedMethods = [
			'findReferences',
			'getCompletionsAtPosition',
			'getCompletionEntryDetails',
			'getCodeFixesAtPosition',
			'getDefinitionAndBoundSpan',
		] as const
		// Preserve the raw methods for the Requests client...
		const rawBound: Record<string, (...args: unknown[]) => unknown> = Object.fromEntries(
			wrappedMethods.map(method => [
				method,
				(languageService[method] as (...args: unknown[]) => unknown).bind(languageService),
			]),
		)
		rawTsLanguageService = new Proxy(languageService, {
			get: (target, prop, receiver) => rawBound[prop as string] ?? Reflect.get(target, prop, receiver),
		})
		// ...then mutate the original service so every other consumer (including
		// the plugin's own feature handlers) goes through the vue-aware wrappers.
		for (const method of wrappedMethods)
			(languageService[method] as unknown) = proxy[method]
		return created
	}
	return [semanticPlugin, createTypeScriptDirectiveCommentPlugin()]
}

/**
 * Requests client backing the vue service plugins' template IntelliSense
 * (component tag/prop/directive completion, ref-hover, ...). Adapted from
 * @vue/repl's worker to the @vue/typescript-plugin 3.3.x request signatures.
 * Unimplemented members return undefined — the plugins degrade gracefully.
 */
/**
 * The @vue/typescript-plugin request functions shift generated offsets by the
 * source-text length (`getMappingOffset` reads
 * `language.scripts.fromVirtualCode(code).snapshot.getLength()`), because the
 * tsserver host prepends a blanked copy of the source to every generated
 * snapshot. The @volar/monaco worker host serves the BARE generated snapshot
 * (protocol/createProject.js getScriptSnapshot), so that shift must be zero —
 * otherwise positions land in garbage and e.g. component-prop completion
 * silently returns nothing. This proxy zeroes exactly that lookup.
 */
function createWorkerSpaceLanguage<T extends object>(language: T): T {
	const zeroLengthSnapshot = { getLength: () => 0 }
	return new Proxy(language, {
		get(target, prop, receiver) {
			if (prop === 'scripts') {
				const scripts = Reflect.get(target, prop, receiver) as object
				return new Proxy(scripts, {
					get(sTarget, sProp) {
						const value = Reflect.get(sTarget, sProp, sTarget)
						if (sProp === 'fromVirtualCode' && typeof value === 'function') {
							return (code: unknown) => {
								const sourceScript = value.call(sTarget, code)
								return sourceScript && new Proxy(sourceScript, {
									get: (ssTarget, ssProp) => ssProp === 'snapshot'
										? zeroLengthSnapshot
										: Reflect.get(ssTarget, ssProp, ssTarget),
								})
							}
						}
						return typeof value === 'function' ? value.bind(sTarget) : value
					},
				})
			}
			const value = Reflect.get(target, prop, receiver)
			return typeof value === 'function' ? value.bind(target) : value
		},
	})
}

function createRequestsClient(getLanguageService: () => LanguageService): Requests {
	const asUri = (fileName: string) => URI.file(fileName)

	function getTsService(): tsTypes.LanguageService {
		return rawTsLanguageService ?? getLanguageService().context.inject('typescript/languageService')
	}
	function getProgram(): tsTypes.Program {
		return getTsService()
			.getProgram()!
	}
	function getVirtualCode(fileName: string): { sourceScript: SourceScript<URI>, virtualCode: VueVirtualCode } | undefined {
		const sourceScript = getLanguageService().context.language.scripts.get(asUri(fileName))
		const virtualCode = sourceScript?.generated?.root
		if (!sourceScript || !(virtualCode instanceof VueVirtualCode))
			return undefined
		return { sourceScript, virtualCode }
	}

	return {
		getComponentNames(fileName) {
			const found = getVirtualCode(fileName)
			return found && getComponentNames(ts, getProgram(), found.virtualCode)
		},
		getComponentProps(fileName, position) {
			const found = getVirtualCode(fileName)
			const language = createWorkerSpaceLanguage(getLanguageService().context.language)
			// The request functions are written for the tsserver plugin where
			// script ids are file names; runtime never touches the id itself.
			return found && getComponentProps(ts, getTsService(), getProgram(), language, found.sourceScript as unknown as SourceScript<string>, found.virtualCode, position)
		},
		getComponentSlots(fileName) {
			const found = getVirtualCode(fileName)
			return found && getComponentSlots(ts, getProgram(), found.virtualCode)
		},
		getComponentDirectives(fileName) {
			return getComponentDirectives(ts, getProgram(), fileName)
		},
		getElementAttrs(fileName, tag) {
			return getElementAttrs(ts, getProgram(), fileName, tag)
		},
		getElementNames(fileName) {
			return getElementNames(ts, getProgram(), fileName)
		},
		isRefAtPosition(fileName, position) {
			const found = getVirtualCode(fileName)
			const language = createWorkerSpaceLanguage(getLanguageService().context.language)
			return found && isRefAtPosition(ts, language, getProgram(), found.sourceScript as unknown as SourceScript<string>, found.virtualCode, position)
		},
		resolveModuleName(fileName, moduleName, allowNonExistent) {
			const host: tsTypes.LanguageServiceHost = getLanguageService().context.inject('typescript/languageServiceHost')
			return resolveModuleName(ts, host, fileName, moduleName, allowNonExistent)
		},
		async getQuickInfoAtPosition(fileName, position) {
			const uri = asUri(fileName)
			const hover = await getLanguageService()
				.getHover(uri, position)
			if (!hover)
				return undefined
			let text = ''
			if (typeof hover.contents === 'string') {
				text = hover.contents
			}
			else if (Array.isArray(hover.contents)) {
				text = hover.contents.map(c => typeof c === 'string' ? c : c.value)
					.join('\n')
			}
			else {
				text = hover.contents.value
			}
			return text.replace(/```typescript/g, '')
				.replace(/```/g, '')
				.replace(/---/g, '')
				.trim()
		},
		// Not needed here: extract-file / drop / highlights plugins are filtered
		// out, and auto-import suggestion enrichment is a tsserver-plugin flow.
		collectExtractProps: () => undefined,
		getImportPathForFile: () => undefined,
		getComponentMeta: () => undefined,
		getDocumentHighlights: () => undefined,
		getEncodedSemanticClassifications: () => undefined,
		getAutoImportSuggestions: () => undefined,
		resolveAutoImportCompletionEntry: () => undefined,
	}
}

globalThis.onmessage = () => {
	initialize((rawCtx: monaco.worker.IWorkerContext<VueWorkerHost>, createData: VueWorkerCreateData) => {
		// monaco 0.55 TDZ shield: `rawCtx.getMirrorModels()` throws ("Cannot
		// access 'webWorkerServer' before initialization") while this factory is
		// still running — the `webWorkerServer` const in editor.worker.start.js
		// has not finished initializing. Volar's TS semantic plugin eagerly
		// builds its program during service creation, which hits exactly that
		// window. Returning [] for those early calls is fine: the project
		// version changes once real models sync, and the program recomputes.
		const ctx: monaco.worker.IWorkerContext<VueWorkerHost> = {
			host: rawCtx.host,
			getMirrorModels: () => {
				try {
					return rawCtx.getMirrorModels()
				}
				catch {
					return []
				}
			},
		}
		const compilerOptions = ts.convertCompilerOptionsFromJson(
			createData.tsconfig.compilerOptions ?? {},
			'/',
		).options
		const vueCompilerOptions: VueCompilerOptions = {
			...getDefaultCompilerOptions(3.5, 'vue', false, GLOBAL_TYPES_ROOT),
			...(createData.tsconfig.vueCompilerOptions ?? {}),
		}

		// Lazy accessor: the client is only invoked at request time, long after
		// `workerService` below has been assigned.
		let workerService: ReturnType<typeof createTypeScriptWorkerLanguageService>
		const requests = createRequestsClient(() => workerService.languageService)
		workerService = createTypeScriptWorkerLanguageService({
			typescript: ts,
			compilerOptions,
			env: createEnv(ctx.host),
			uriConverter: {
				asFileName: uri => uri.path,
				asUri: fileName => URI.file(fileName),
			},
			workerContext: ctx,
			languagePlugins: [
				createVueLanguagePlugin(ts, compilerOptions, vueCompilerOptions, uri => uri.path),
			],
			languageServicePlugins: [
				...createTsServicePlugins(vueCompilerOptions),
				...createVueLanguageServicePlugins(ts, requests)
					.filter(plugin => !plugin.name || !IGNORED_SERVICE_PLUGINS.has(plugin.name)),
			],
			// (No `setup` hook: unlike 3.0.x, nothing in @vue/language-service
			// 3.3.x reads `project.vue` — the language plugin closes over the
			// vueCompilerOptions itself.)
		})
		return workerService
	})
}
