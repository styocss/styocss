import type { WebContainer } from '@webcontainer/api'
import JSON5 from 'json5'
import * as monaco from 'monaco-editor'

// Singleton state: the fallback `pika` globals model is disposed once the real
// generated `.pikacss/pika.gen.ts` types have been loaded. Both live as monaco
// MODELS (not extra libs) so that model sync feeds them to BOTH the built-in
// TS worker and the Volar vue worker (which never sees extra libs).
let pikaFallbackModel: monaco.editor.ITextModel | null = null
let pikaGenContent = ''
let pikaGenLoadRevision = 0

const PIKA_GEN_URI = monaco.Uri.parse('file:///.pikacss/pika.gen.ts')
const PIKA_GLOBALS_URI = monaco.Uri.parse('file:///pika-globals.d.ts')

/**
 * Loads Monaco configuration (tsconfig) and types (node_modules) from WebContainer.
 * Refactored to simulate Node.js module resolution using file:/// URIs.
 */
export function useMonacoConfig() {
	async function loadMonacoConfig(webcontainerInstance: WebContainer) {
		// 1. Load types from node_modules
		await loadTypes(webcontainerInstance)

		// 2. Load and apply tsconfig.json
		await loadTsConfig(webcontainerInstance)
	}

	/**
	 * Declares a fallback `pika` global in Monaco so the editor stops
	 * reporting "Cannot find name 'pika'" before {@link loadPikaGenTypes} has
	 * managed to load the real generated declarations (or if it never does).
	 * Self-contained (no imports) so it applies regardless of module resolution.
	 * Lives as a model (immune to `setExtraLibs`, visible to the Volar worker).
	 *
	 * Also registers the `*.vue` / `*.css` module shims. These stay an EXTRA
	 * LIB on purpose: only the built-in TS worker needs them, and the loose
	 * `*.vue` wildcard must never be synced into the Volar worker where it
	 * would shadow precise SFC resolution. Extra libs are wiped by `loadTypes`'
	 * `setExtraLibs`, so this must run after it.
	 */
	function ensurePikaFallbackModel() {
		if (pikaGenContent || pikaFallbackModel)
			return
		const source = `
type PikaStyleItem = string | Record<string, any>
interface PikaFn {
  (...items: PikaStyleItem[]): string
}
declare const pika: PikaFn
`
		pikaFallbackModel = monaco.editor.createModel(source, 'typescript', PIKA_GLOBALS_URI)
	}

	function loadPikaGlobals() {
		// `vite/client` is not wired into the worker, so shim the asset modules the
		// templates import: `./App.vue` in main.ts and css imports (the `*.css`
		// pattern also matches the bare `pika.css` virtual module).
		const shims = `
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, any>
  export default component
}
declare module '*.css' {}
`
		const ts = (monaco.languages.typescript as any).typescriptDefaults
		ensurePikaFallbackModel()
		ts.addExtraLib(shims, 'file:///module-shims.d.ts')
	}

	/**
	 * Loads the real generated `.pikacss/pika.gen.ts` from the WebContainer into
	 * Monaco, replacing the loose fallback globals from {@link loadPikaGlobals}
	 * so `pika({ ... })` gets the actual CSS property / shortcut autocomplete.
	 * Requires `loadTypes` to have finished (the generated file imports from
	 * `@pikacss/unplugin-pikacss`, resolved against the loaded node_modules) —
	 * callers must await `loadMonacoConfig` first. Safe to call repeatedly
	 * (e.g. after pika.gen HMR updates); no-ops while the content is unchanged.
	 */
	async function loadPikaGenTypes(webcontainerInstance: WebContainer): Promise<'updated' | 'unchanged' | 'stale' | 'unavailable'> {
		const revision = ++pikaGenLoadRevision
		let content: string | undefined
		let lastError: unknown

		// Atomic generated-file replacement can briefly race a read. Retry a few
		// times, but never translate a read failure into deletion: the live
		// workspace tree is the authority for whether the file actually exists.
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				content = await webcontainerInstance.fs.readFile('/.pikacss/pika.gen.ts', 'utf-8')
				break
			}
			catch (error) {
				lastError = error
				if (attempt < 2)
					await new Promise(resolve => setTimeout(resolve, 40 * (attempt + 1)))
			}
		}

		if (revision !== pikaGenLoadRevision)
			return 'stale'
		if (!content) {
			console.warn('[MonacoConfig] pika.gen.ts exists but could not be read; keeping the last known model.', lastError)
			return 'unavailable'
		}

		const existing = monaco.editor.getModel(PIKA_GEN_URI)
		if (content === pikaGenContent && existing)
			return 'unchanged'

		pikaGenContent = content
		if (existing)
			existing.setValue(content)
		else
			monaco.editor.createModel(content, 'typescript', PIKA_GEN_URI)
		pikaFallbackModel?.dispose()
		pikaFallbackModel = null
		revalidateTypeScriptModels()
		return 'updated'
	}

	function removePikaGenTypes(): 'removed' | 'missing' {
		// Cancel any older in-flight read before applying the authoritative
		// filesystem deletion. Keep the Monaco model object alive when it exists
		// so an editor currently showing pika.gen.ts remains bound across a
		// delete -> recreate cycle instead of holding a disposed model.
		pikaGenLoadRevision++
		const existing = monaco.editor.getModel(PIKA_GEN_URI)
		const changed = Boolean(pikaGenContent || existing?.getValue())
		pikaGenContent = ''
		if (existing?.getValue())
			existing.setValue('')
		ensurePikaFallbackModel()
		if (changed)
			revalidateTypeScriptModels()
		return changed ? 'removed' : 'missing'
	}

	function revalidateTypeScriptModels() {
		// Model changes only revalidate the changed model; other open models
		// (e.g. pika.config.ts importing ./.pikacss/pika.gen.ts before the model
		// existed) keep stale markers. Bumping a tiny extra lib fires
		// onDidExtraLibsChange, which revalidates every built-in TS model without
		// restarting its worker. Vue/Volar is refreshed separately by App.vue.
		const ts = (monaco.languages.typescript as any).typescriptDefaults
		ts.addExtraLib(`// pika.gen revision ${Date.now()}\n`, 'file:///__pika-gen-revision.d.ts')
	}

	/**
	 * Creates Monaco models for the template's TS/TSX/Vue sources up front.
	 * Models are otherwise created lazily on first open, so imports between
	 * template files (e.g. `./components/PreferencesCard.tsx` from App.tsx)
	 * report "Cannot find module" until the target file has been opened once.
	 * Requires eager model sync (set in MonacoEditor.vue) so the TS worker sees
	 * models that are not bound to an editor; the Volar worker syncs `.vue` and
	 * `.ts/.tsx` models through its own getSyncUris list.
	 */
	function preloadTemplateModels(files: Record<string, string>) {
		for (const [path, content] of Object.entries(files)) {
			if (!/\.(?:tsx?|vue)$/.test(path))
				continue
			const uri = monaco.Uri.parse(`file:///${path}`)
			if (!monaco.editor.getModel(uri))
				monaco.editor.createModel(content, path.endsWith('.vue') ? 'vue' : 'typescript', uri)
		}
	}

	async function loadTypes(webcontainerInstance: WebContainer) {
		const libMap = new Map<string, string>()
		const compilerPaths: Record<string, string[]> = {}

		async function walk(dir: string) {
			try {
				const entries = await webcontainerInstance.fs.readdir(dir, { withFileTypes: true })
				for (const entry of entries) {
					const fullPath = `${dir === '/' ? '' : dir}/${entry.name}`

					if (entry.isDirectory()) {
						if (entry.name === '.bin' || entry.name === '.cache')
							continue
						await walk(fullPath)
					}
					else if (entry.isFile()) {
						// `.d.mts`/`.d.cts` matter: several packages (vue,
						// @pikacss/unplugin-pikacss, @vitejs/plugin-*) ship ESM-only types.
						if (/\.d\.[mc]?ts$/.test(entry.name)) {
							const content = await webcontainerInstance.fs.readFile(fullPath, 'utf-8')
							// Use file:/// URIs to match Monaco's internal Node resolution
							libMap.set(`file://${fullPath}`, content)
						}
						else if (entry.name === 'package.json') {
							try {
								const content = await webcontainerInstance.fs.readFile(fullPath, 'utf-8')
								const pkg = JSON5.parse(content)

								// Expose the manifest to the worker: bundler module resolution
								// reads package.json (`exports`, `types`, `main`) via
								// host.readFile. (Extra libs are also parsed as root files, but
								// any parse noise stays invisible — diagnostics are only
								// requested for open editor models.)
								libMap.set(`file://${fullPath}`, content)
								const typesPath = pkg.types || pkg.typings

								// Node resolution defaults to index.d.ts.
								// If package.json specifies something else, we might need a mapping.
								if (pkg.name && typesPath) {
									const normalizedTypesPath = typesPath.startsWith('./') ? typesPath.slice(2) : typesPath

									// If the types are NOT at index.d.ts, we help Monaco find them.
									// For example: "types": "dist/main.d.ts"
									if (normalizedTypesPath !== 'index.d.ts') {
										// Clean up path for mapping
										const packageRoot = dir // e.g. /node_modules/foo
										const absoluteTypesPath = `${packageRoot}/${normalizedTypesPath}`

										// Remove leading slash for compiler option paths if needed,
										// but for file:/// usage, we might rely on the relative lookup from baseUrl.
										// However, standard paths config usually ignores "file://" prefix in the value
										// if baseUrl is set?
										// Actually, with baseUrl="file:///", we can map:
										// "foo": ["node_modules/foo/dist/main.d.ts"] (relative to /)

										const relativePath = absoluteTypesPath.startsWith('/') ? absoluteTypesPath.slice(1) : absoluteTypesPath

										// Add mapping for this specific package
										compilerPaths[pkg.name] = [relativePath]
									}
								}
							}
							catch {
								// ignore invalid package.json
							}
						}
					}
				}
			}
			catch {
				// ignore
			}
		}

		await walk('/node_modules')

		// Batch update extra libs
		const ts = (monaco.languages.typescript as any).typescriptDefaults
		ts.setExtraLibs(
			Array.from(libMap.entries())
				.map(([path, content]) => ({
					filePath: path,
					content,
				})),
		)

		// Apply discovered paths to compiler options (only for special cases)
		// Standard resolution handles the rest via baseUrl="file:///" and "*"=["node_modules/*"]
		if (Object.keys(compilerPaths).length > 0) {
			updateCompilerOptions({ paths: compilerPaths })
		}
	}

	async function loadTsConfig(webcontainerInstance: WebContainer) {
		try {
			const tsconfigContent = await webcontainerInstance.fs.readFile('/tsconfig.json', 'utf-8')
				.catch(() => null)
			if (!tsconfigContent)
				return

			const tsconfig = JSON5.parse(tsconfigContent)

			// Handle references logic (simplified for now, mostly merging compilerOptions)
			if (tsconfig.references) {
				for (const ref of tsconfig.references) {
					if (ref.path) {
						const refPath = ref.path.replace(/^\.\//, '')
						// If path is a folder, look for tsconfig.json inside, otherwise read file
						// Vite templates usually have ./tsconfig.app.json
						const potentialFiles = [
							refPath,
							`${refPath}/tsconfig.json`,
						]

						for (const path of potentialFiles) {
							const refContent = await webcontainerInstance.fs.readFile(path, 'utf-8')
								.catch(() => null)
							if (refContent) {
								const refConfig = JSON5.parse(refContent)
								if (refConfig.compilerOptions) {
									applyCompilerOptions(refConfig.compilerOptions)
								}
								break // found the config
							}
						}
					}
				}
			}

			if (tsconfig.compilerOptions) {
				applyCompilerOptions(tsconfig.compilerOptions)
			}
		}
		catch (e) {
			console.error('[MonacoConfig] Failed to load tsconfig:', e)
		}
	}

	function applyCompilerOptions(options: any) {
		const monacoOptions: any = {}

		// Map basic options
		if (options.target)
			monacoOptions.target = mapTarget(options.target)
		if (options.module)
			monacoOptions.module = mapModule(options.module)
		if (options.jsx)
			monacoOptions.jsx = mapJsx(options.jsx)

		// Copy direct values (boolean/string options pass through as-is; only
		// enum-valued options need mapping to the TS numeric values above).
		const directCopy = [
			'jsxImportSource',
			'strict',
			'allowSyntheticDefaultImports',
			'esModuleInterop',
			'baseUrl',
			'paths',
			'allowJs',
			'checkJs',
			'allowImportingTsExtensions',
		]

		for (const key of directCopy) {
			if (options[key] !== undefined) {
				monacoOptions[key] = options[key]
			}
		}

		// Force critical overrides for WebContainer environment.
		// `bundler` (100) is not in monaco's ModuleResolutionKind, but the worker's
		// TS 5.9 accepts it; it is what the templates use, and it resolves the
		// package.json `exports` maps loaded by `loadTypes`.
		monacoOptions.moduleResolution = 100
		monacoOptions.allowNonTsExtensions = true

		// If baseUrl is not set in tsconfig, default it to file:/// (done in initialization, but good to reinforce)
		// If user tsconfig has baseUrl: '.', we might map it to 'file:///' or '/'?
		// Let's rely on the base config in MonacoEditor.vue for defaults, and just merge overrides here.

		updateCompilerOptions(monacoOptions)
	}

	function updateCompilerOptions(newOptions: any) {
		const defaults = (monaco.languages.typescript as any).typescriptDefaults
		const current = defaults.getCompilerOptions()

		defaults.setCompilerOptions({
			...current,
			...newOptions,
			paths: {
				...current.paths,
				...(newOptions.paths || {}),
			},
		})
	}

	// --- Helpers ---
	function mapTarget(target: string) {
		const ts = monaco.languages.typescript as any
		switch (target?.toLowerCase()) {
			case 'es5': return ts.ScriptTarget.ES5
			case 'es6': return ts.ScriptTarget.ES2015
			case 'es2015': return ts.ScriptTarget.ES2015
			case 'es2020': return ts.ScriptTarget.ES2020
			case 'esnext': return ts.ScriptTarget.ESNext
			default: return ts.ScriptTarget.ESNext
		}
	}

	function mapModule(mod: string) {
		const ts = monaco.languages.typescript as any
		switch (mod?.toLowerCase()) {
			case 'commonjs': return ts.ModuleKind.CommonJS
			case 'esnext': return ts.ModuleKind.ESNext
			default: return ts.ModuleKind.ESNext
		}
	}

	function mapJsx(jsx: string) {
		const ts = monaco.languages.typescript as any
		switch (jsx?.toLowerCase()) {
			case 'react': return ts.JsxEmit.React
			case 'react-jsx': return ts.JsxEmit.ReactJSX
			case 'preserve': return ts.JsxEmit.Preserve
			default: return ts.JsxEmit.Preserve
		}
	}

	return {
		loadMonacoConfig,
		loadPikaGlobals,
		loadPikaGenTypes,
		removePikaGenTypes,
		preloadTemplateModels,
	}
}
