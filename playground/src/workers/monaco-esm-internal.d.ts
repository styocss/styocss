// Ambient declarations for Monaco worker modules exposed through the package export map that ship no .d.ts.
// Paths verified against monaco-editor@0.56.0 — re-verify on version bumps.

declare module 'monaco-editor/editor/editor.worker.js' {
	export function initialize(callback: (ctx: any, createData: any) => any): void
}

declare module 'monaco-editor/languages/features/typescript/tsWorker.js' {
	export class TypeScriptWorker {
		constructor(ctx: unknown, createData: unknown)
		getScriptFileNames(): string[]
	}
}
