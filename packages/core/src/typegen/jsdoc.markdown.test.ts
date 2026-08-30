import type { HTMLElement as HappyDOMHTMLElement } from 'happy-dom'
import { Window } from 'happy-dom'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { renderTypegenJSDoc } from './jsdoc'

function getQuickInfo(jsdoc: string) {
	const fileName = '/typegen-jsdoc-markdown.ts'
	const source = `${jsdoc}\nexport const target = 'value' as const\n`
	const host: ts.LanguageServiceHost = {
		fileExists: name => name === fileName,
		getCompilationSettings: () => ({
			module: ts.ModuleKind.ESNext,
			target: ts.ScriptTarget.ESNext,
		}),
		getCurrentDirectory: () => '/',
		getDefaultLibFileName: () => '/lib.d.ts',
		getScriptFileNames: () => [fileName],
		getScriptSnapshot: name => name === fileName ? ts.ScriptSnapshot.fromString(source) : undefined,
		getScriptVersion: () => '1',
		readDirectory: () => [],
		readFile: name => name === fileName ? source : undefined,
	}
	const languageService = ts.createLanguageService(host)
	const position = source.indexOf('target') + 1
	const quickInfo = languageService.getQuickInfoAtPosition(fileName, position)

	if (quickInfo == null)
		throw new Error('TypeScript did not return quick info for generated JSDoc probe')

	return {
		documentation: ts.displayPartsToString(quickInfo.documentation),
		syntacticDiagnostics: languageService.getSyntacticDiagnostics(fileName),
		tags: (quickInfo.tags ?? []).map(tag => ({
			name: tag.name,
			text: ts.displayPartsToString(tag.text),
		})),
	}
}

async function renderWithMonaco(markdown: string) {
	const window = new Window({ url: 'https://pikacss.test/' })
	const globals = {
		document: window.document,
		HTMLElement: window.HTMLElement,
		navigator: window.navigator,
		Node: window.Node,
		window,
	}
	const previousDescriptors = new Map(Object.keys(globals)
		.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const))

	try {
		for (const [name, value] of Object.entries(globals))
			Object.defineProperty(globalThis, name, { configurable: true, value })

		const rendererUrl = import.meta.resolve('monaco-editor/esm/vs/base/browser/markdownRenderer.js')
		const { renderMarkdown } = await import(rendererUrl) as {
			renderMarkdown: (markdown: { isTrusted: boolean, supportHtml: boolean, value: string }) => {
				dispose: () => void
				element: HappyDOMHTMLElement
			}
		}
		const rendered = renderMarkdown({
			isTrusted: false,
			supportHtml: false,
			value: markdown,
		})
		try {
			return {
				code: rendered.element.querySelector('pre > code')?.textContent ?? null,
				heading: rendered.element.querySelector('h3')?.textContent ?? null,
			}
		}
		finally {
			rendered.dispose()
		}
	}
	finally {
		for (const [name, descriptor] of previousDescriptors) {
			if (descriptor == null)
				delete (globalThis as Record<string, unknown>)[name]
			else
				Object.defineProperty(globalThis, name, descriptor)
		}
		window.close()
	}
}

describe('typegen JSDoc Markdown integration', () => {
	it('preserves Markdown structure through TypeScript quick info and Monaco rendering', async () => {
		const jsdoc = renderTypegenJSDoc({
			description: 'Token documentation with email-like prose @deprecated that must stay prose.',
			previewCss: ':root {\n  --accent: #34d399;\n}\n@media (min-width: 640px) {\n  .demo { display: grid; }\n}\n.safe::after { content: "*/"; }',
			tags: [{ name: 'deprecated', text: 'Use the replacement.' }],
		})
			.join('\n')
		const quickInfo = getQuickInfo(jsdoc)

		expect(quickInfo.syntacticDiagnostics)
			.toEqual([])
		expect(quickInfo.tags)
			.toEqual([{ name: 'deprecated', text: 'Use the replacement.' }])
		expect(quickInfo.documentation)
			.toContain('\n### PikaCSS Preview\n```css\n:root {')
		expect(quickInfo.documentation)
			.toContain('@media (min-width: 640px)')
		expect(quickInfo.documentation)
			.not.toContain('\u200E')

		const rendered = await renderWithMonaco(quickInfo.documentation)
		expect(rendered.heading)
			.toBe('PikaCSS Preview')
		const visualCode = rendered.code?.replaceAll('\u2060', '')
		expect(visualCode)
			.toContain(':root {\n  --accent: #34d399;')
		expect(visualCode)
			.toContain('@media (min-width: 640px)')
		expect(visualCode)
			.toContain('content: "*/";')
	})
})
