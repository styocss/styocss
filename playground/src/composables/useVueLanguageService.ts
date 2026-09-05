import type { WorkerLanguageService } from '@volar/monaco/worker'
import type { WebContainer } from '@webcontainer/api'
import type { VueWorkerCreateData, VueWorkerHost } from '../workers/vueWorkerShared'
import { activateAutoInsertion, activateMarkers, registerProviders } from '@volar/monaco'
import JSON5 from 'json5'
import * as monaco from 'monaco-editor'

// Volar-based language features (completion, hover, diagnostics — script AND
// template) for `.vue` models. The built-in monaco TS worker keeps handling
// `.ts/.tsx` (its providers cannot be unregistered, so routing them through
// Volar would duplicate everything); the Volar worker still sees those files
// through model sync, and node_modules through the WebContainer FS bridge.

let setupPromise: Promise<monaco.IDisposable> | null = null
let activeWorker: monaco.editor.MonacoWebWorker<WorkerLanguageService> | null = null
let markerDisposable: monaco.IDisposable | null = null

/**
 * Compiler options mirroring `@vue/tsconfig/tsconfig.dom.json` — resolving the
 * `extends` chain inside the browser buys nothing, its values are stable. The
 * template's own `tsconfig.app.json` compilerOptions are shallow-merged on top.
 */
const VUE_TSCONFIG_BASE: Record<string, unknown> = {
	target: 'esnext',
	module: 'esnext',
	moduleResolution: 'bundler',
	lib: ['esnext', 'dom', 'dom.iterable'],
	jsx: 'preserve',
	jsxImportSource: 'vue',
	strict: true,
	noEmit: true,
	isolatedModules: true,
	verbatimModuleSyntax: true,
	skipLibCheck: true,
	allowImportingTsExtensions: true,
	useDefineForClassFields: true,
	resolveJsonModule: true,
	allowJs: true,
}

/** Volar FileType values: 1 = File, 2 = Directory. */
function toFileType(entry: { isDirectory: () => boolean }): 1 | 2 {
	return entry.isDirectory() ? 2 : 1
}

/**
 * Bridges the Volar worker's file system to the WebContainer. Everything under
 * /node_modules is cached permanently (immutable after install); other paths
 * (template sources, generated files) are read through so they stay fresh —
 * though synced editor models shadow those anyway.
 */
function createWorkerHost(container: WebContainer): VueWorkerHost {
	const fileCache = new Map<string, Promise<string | null>>()
	const dirCache = new Map<string, Promise<[string, 1 | 2][]>>()
	const cacheable = (path: string) => path.startsWith('/node_modules/')

	const readFile = (path: string): Promise<string | null> =>
		container.fs.readFile(path, 'utf-8')
			.catch(() => null)
	const readDirectory = (path: string): Promise<[string, 1 | 2][]> =>
		container.fs.readdir(path, { withFileTypes: true })
			.then(entries => entries.map(e => [e.name, toFileType(e)] as [string, 1 | 2]))
			.catch(() => [])

	return {
		async fsReadFile(path) {
			if (!cacheable(path))
				return readFile(path)
			let cached = fileCache.get(path)
			if (!cached) {
				cached = readFile(path)
				fileCache.set(path, cached)
			}
			return cached
		},
		async fsReadDirectory(path) {
			if (!cacheable(path))
				return readDirectory(path)
			let cached = dirCache.get(path)
			if (!cached) {
				cached = readDirectory(path)
				dirCache.set(path, cached)
			}
			return cached
		},
		async fsStat(path) {
			if (path === '/')
				return { type: 2 }
			const slash = path.lastIndexOf('/')
			const parent = slash === 0 ? '/' : path.slice(0, slash)
			const name = path.slice(slash + 1)
			const entries = await this.fsReadDirectory(parent)
			const entry = entries.find(([n]) => n === name)
			return entry ? { type: entry[1] } : null
		},
	}
}

async function readTemplateTsconfig(container: WebContainer): Promise<VueWorkerCreateData['tsconfig']> {
	const content = await container.fs.readFile('/tsconfig.app.json', 'utf-8')
		.catch(() => null)
	let compilerOptions: Record<string, unknown> = {}
	let vueCompilerOptions: Record<string, unknown> | undefined
	if (content) {
		try {
			const parsed = JSON5.parse(content)
			compilerOptions = parsed.compilerOptions ?? {}
			vueCompilerOptions = parsed.vueCompilerOptions
			delete compilerOptions.tsBuildInfoFile
		}
		catch (e) {
			console.error('[VueLS] Failed to parse /tsconfig.app.json:', e)
		}
	}
	return {
		compilerOptions: { ...VUE_TSCONFIG_BASE, ...compilerOptions },
		vueCompilerOptions,
	}
}

/**
 * Files the Volar worker's program is rooted at: every synced editor model
 * that is part of the template project. Includes `.ts/.tsx` (imports from SFC
 * scripts), the pika globals/pika.gen models, and the `.vue` models themselves.
 */
function getSyncUris(): monaco.Uri[] {
	return monaco.editor.getModels()
		.map(model => model.uri)
		.filter(uri => /\.(?:vue|tsx?)$/.test(uri.path))
}

/**
 * Boots the Volar vue language service against the given WebContainer.
 * Idempotent — repeated calls return the same setup.
 */
export function setupVueLanguageService(container: WebContainer): Promise<monaco.IDisposable> {
	setupPromise ??= (async () => {
		const tsconfig = await readTemplateTsconfig(container)

		const getWorker = globalThis.MonacoEnvironment?.getWorker
		if (getWorker == null)
			throw new Error('[VueLS] MonacoEnvironment.getWorker is not configured')

		// Monaco 0.56 removed the old top-level createWebWorker compatibility
		// helper. Reproduce its small createData handshake, then use the public
		// editor.createWebWorker API for model synchronization and host RPC.
		const rawWorker = Promise.resolve(getWorker('workerMain.js', 'vue'))
			.then((worker) => {
				worker.postMessage('ignore')
				worker.postMessage({ tsconfig } satisfies VueWorkerCreateData)
				return worker
			})
		const workerHost = createWorkerHost(container)
		const worker = monaco.editor.createWebWorker<WorkerLanguageService>({
			worker: rawWorker,
			host: {
				fsReadDirectory: (path: string) => workerHost.fsReadDirectory(path),
				fsReadFile: (path: string) => workerHost.fsReadFile(path),
				fsStat: (path: string) => workerHost.fsStat(path),
			},
			keepIdleModels: true,
		})

		activeWorker = worker
		markerDisposable = activateMarkers(worker, ['vue'], 'vue', getSyncUris, monaco.editor)
		const disposables: monaco.IDisposable[] = [
			worker,
			activateAutoInsertion(worker, ['vue'], getSyncUris, monaco.editor),
			await registerProviders(worker, ['vue'], getSyncUris, monaco.languages),
		]
		return {
			dispose() {
				markerDisposable?.dispose()
				markerDisposable = null
				for (const disposable of disposables)
					disposable.dispose()
				if (activeWorker === worker)
					activeWorker = null
			},
		}
	})()
	return setupPromise
}
/**
 * Synchronize the current Monaco project into Volar and re-run diagnostics for
 * attached Vue models after an external/generated project file changes. Hover
 * and completion providers already call `withSyncedResources()` per request;
 * re-arming markers closes the remaining stale-diagnostics gap without
 * recreating the language worker.
 */
export async function refreshVueLanguageService(): Promise<void> {
	if (!setupPromise)
		return
	await setupPromise
	if (!activeWorker)
		return
	await activeWorker.withSyncedResources(getSyncUris())
	markerDisposable?.dispose()
	markerDisposable = activateMarkers(activeWorker, ['vue'], 'vue', getSyncUris, monaco.editor)
}
