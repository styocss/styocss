// Custom TypeScript worker entry replacing monaco's stock
// `esm/vs/language/typescript/ts.worker.js`.
//
// Why: `useMonacoConfig.loadTypes()` loads every `.d.ts`/`package.json` under
// the WebContainer's /node_modules as extra libs (thousands of files), and
// monaco's `TypeScriptWorker.getScriptFileNames()` makes EVERY extra lib a
// ROOT file of the TS program. Each keystroke then re-processes thousands of
// root files, so completion responses arrive after the user has already typed
// the next character and the quick-suggest session gets cancelled — the
// as-you-type autocomplete flakiness.
//
// Trimming the ROOT set is safe: `readFile`/`fileExists`/`getScriptSnapshot`
// in the worker still consult the full extraLibs map, so on-demand module
// resolution (including package.json `exports` reads for bundler resolution)
// keeps working. Only files that take effect *ambiently* (nothing imports
// them) must remain roots.
//
// Imports target tsWorker.js/editor.worker.js directly (NOT ts.worker.js,
// which installs its own `self.onmessage` at module eval). Export-map paths
// verified against monaco-editor@0.56.0 — a version bump that moves them
// fails loudly at build time.
import { initialize } from 'monaco-editor/editor/editor.worker.js'
import { TypeScriptWorker } from 'monaco-editor/languages/features/typescript/tsWorker.js'

// Ambient libs under /node_modules that must stay ROOT files. The templates'
// tsconfig `types: ["vite/client"]` is not forwarded to the worker, so
// vite/client.d.ts only takes effect as a root (its `/// <reference path>`
// files resolve on demand once it is in the program).
const AMBIENT_ROOT_ALLOWLIST = new Set([
	'file:///node_modules/vite/client.d.ts',
])

function keepAsRoot(fileName: string): boolean {
	// Editor models plus the non-node_modules extra libs: pika-globals.d.ts,
	// module-shims.d.ts, .pikacss/pika.gen.ts — all ambient, all stay.
	if (!fileName.startsWith('file:///node_modules/'))
		return true
	// @types/* packages provide globals and are only in the program as roots
	// (this host cannot do automatic @types directory inclusion).
	if (fileName.startsWith('file:///node_modules/@types/') && /\.d\.[mc]?ts$/.test(fileName))
		return true
	return AMBIENT_ROOT_ALLOWLIST.has(fileName)
}

class PlaygroundTypeScriptWorker extends TypeScriptWorker {
	override getScriptFileNames(): string[] {
		return super.getScriptFileNames()
			.filter(keepAsRoot)
	}
}

globalThis.onmessage = () => {
	initialize((ctx, createData) => new PlaygroundTypeScriptWorker(ctx, createData))
}
