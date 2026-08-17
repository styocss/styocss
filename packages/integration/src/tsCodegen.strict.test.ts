/* eslint-disable no-template-curly-in-string */
import type { Engine, EngineConfig } from '@pikacss/core'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineEnginePlugin } from '@pikacss/core'
import * as ts from 'typescript'
import { afterAll, describe, expect, it } from 'vitest'
import { createCtx } from './ctx'

// repoRoot ← packages/integration/src → up three levels. Computed at runtime so
// no absolute path literal appears in source.
const srcDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(srcDir, '..', '..', '..')
const coreDts = join(repoRoot, 'packages', 'core', 'dist', 'index.d.mts')

// The exclusive value unions the design-tokens plugin would publish for a project
// with one color token (`--color-primary`) governing `color`/`background-color`
// and one dimension token (`--space-sm`) governing `padding`, with `strict.types`
// enabled. Mirrors `buildStrictTypeEntries` output; the plugin's own test covers
// deriving these from real tokens, so this test focuses on the codegen + the
// compile-time exclusivity it produces.
const STRICT_ENTRIES = [
	{
		property: 'color',
		union: [
			'"var(--color-primary)"',
			'`var(--color-primary, ${string})`',
			'`var(${string}--color-primary${string})`',
			'"inherit"',
			'"initial"',
			'"unset"',
			'"revert"',
			'"revert-layer"',
			'"transparent"',
			'"currentColor"',
			'`calc(${string})`',
			'`color-mix(${string})`',
			'`min(${string})`',
			'`max(${string})`',
			'`clamp(${string})`',
			'`light-dark(${string})`',
		],
	},
	{
		property: 'padding',
		union: [
			'"var(--space-sm)"',
			'`var(--space-sm, ${string})`',
			'`var(${string}--space-sm${string})`',
			'"inherit"',
			'"0"',
			'"auto"',
			'`calc(${string})`',
		],
	},
]

// An inline engine plugin that publishes the strict-type surface through the same
// duck-typed contract the design-tokens plugin uses. The integration never
// imports the plugin package.
function strictTypesProducer() {
	return defineEnginePlugin({
		name: 'test-strict-types-producer',
		configureEngine(engine: Engine) {
			;(engine as any).designTokens = { strictTypes: () => STRICT_ENTRIES }
		},
	})
}

// Generates a real pika.gen.ts through the full integration pipeline.
async function generatePikaGen(dir: string): Promise<string> {
	const engineConfig: EngineConfig = { plugins: [strictTypesProducer()] }
	const ctx = createCtx({
		cwd: dir,
		currentPackageName: '@pikacss/core',
		configOrPath: engineConfig,
		fnName: 'pika',
		transformedFormat: 'string',
		tsCodegen: 'pika.gen.ts',
		scan: { include: ['src/**/*.ts'], exclude: [] },
		autoCreateConfig: false,
	})
	await ctx.setup()
	await ctx.writeTsCodegenFile()
	return readFile(join(dir, 'pika.gen.ts'), 'utf8')
}

// Compiles the given source files with the repo TypeScript, resolving
// `@pikacss/core` to its built declaration file, and returns the diagnostics.
function compile(fileNames: string[]): ts.Diagnostic[] {
	const options: ts.CompilerOptions = {
		target: ts.ScriptTarget.ES2022,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		strict: true,
		skipLibCheck: true,
		noEmit: true,
		types: [],
		// `paths` targets an absolute declaration file, so no `baseUrl` is needed;
		// `baseUrl` is also deprecated in TypeScript 6.0 and removed in 7.0.
		paths: { '@pikacss/core': [coreDts] },
	}
	const program = ts.createProgram(fileNames, options)
	return [...ts.getPreEmitDiagnostics(program)]
}

const tempDirs: string[] = []

async function makeTempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'pikacss-strict-types-'))
	tempDirs.push(dir)
	return dir
}

afterAll(async () => {
	await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })))
})

describe('strict-type codegen: end-to-end compilation', () => {
	it('renders the constraint and intersected item type into pika.gen.ts', async () => {
		const dir = await makeTempDir()
		const content = await generatePikaGen(dir)

		expect(content)
			.toContain('type __PikaStrictProperties = {')
		expect(content)
			.toContain('"color"?: PropertyValue<')
		// The hyphenated property is narrowed in both kebab and camel forms.
		expect(content)
			.toContain('"padding"?: PropertyValue<')
		expect(content)
			.toContain('type StyleFn_String = (...params: (StyleItem & __PikaStrictProperties)[]) => string')
	})

	it('accepts valid values and rejects invalid ones at the type level', async () => {
		const dir = await makeTempDir()
		await generatePikaGen(dir)

		const usage = [
			`/// <reference path="./pika.gen.ts" />`,
			`export {}`,
			``,
			`// --- valid values compile ---`,
			`const okToken = pika({ color: 'var(--color-primary)' })`,
			`const okFallback = pika({ color: 'var(--color-primary, #fff)' })`,
			`// runtime accepts these var() forms too: no space after the comma, and`,
			`// internal whitespace inside the parentheses (strict.ts BARE_VAR_RE)`,
			`const okFallbackNoSpace = pika({ color: 'var(--color-primary,#fff)' })`,
			`const okBareWhitespace = pika({ color: 'var( --color-primary )' })`,
			`const okDimFallbackNoSpace = pika({ padding: 'var(--space-sm,4px)' })`,
			`const okKeyword = pika({ color: 'inherit' })`,
			`const okBuiltin = pika({ color: 'transparent' })`,
			`const okCalc = pika({ color: 'calc(1px)' })`,
			`const okColorMix = pika({ color: 'color-mix(in srgb, red, blue)' })`,
			`const okDimToken = pika({ padding: 'var(--space-sm)' })`,
			`const okDimZero = pika({ padding: '0' })`,
			`const okDimAuto = pika({ padding: 'auto' })`,
			`const okDimCalc = pika({ padding: 'calc(100% - 8px)' })`,
			`// non-governed property stays permissive`,
			`const okFree = pika({ fontSize: '17px' })`,
			`// nested selectors are not narrowed (match runtime, which checks top-level only)`,
			`const okNested = pika({ '$:hover': { color: '#ff0000' } })`,
			`// string / shortcut items still work`,
			`const okString = pika('some-shortcut')`,
			`// fallback tuple form of a valid value`,
			`const okTuple = pika({ color: ['var(--color-primary)', ['inherit']] })`,
			``,
			`// --- invalid values fail to compile ---`,
			`// @ts-expect-error a raw hex literal is not an allowed color value`,
			`const badColor = pika({ color: '#ff0000' })`,
			`// @ts-expect-error a raw length is not an allowed dimension value`,
			`const badDim = pika({ padding: '17px' })`,
			`// @ts-expect-error a dimension token is not valid on a color property`,
			`const badCrossType = pika({ color: 'var(--space-sm)' })`,
			``,
			`export const _used = [`,
			`  okToken, okFallback, okFallbackNoSpace, okBareWhitespace,`,
			`  okDimFallbackNoSpace, okKeyword, okBuiltin, okCalc, okColorMix,`,
			`  okDimToken, okDimZero, okDimAuto, okDimCalc, okFree, okNested,`,
			`  okString, okTuple, badColor, badDim, badCrossType,`,
			`]`,
			``,
		].join('\n')
		await writeFile(join(dir, 'usage.ts'), usage)

		const diagnostics = compile([join(dir, 'pika.gen.ts'), join(dir, 'usage.ts')])
		const messages = diagnostics.map(d => `${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`)

		// Zero diagnostics means: every valid line compiled, and every invalid line
		// produced exactly the error consumed by its `@ts-expect-error` directive.
		// A leftover unused-directive error (TS2578) would appear here if narrowing
		// failed to reject an invalid value.
		expect(messages)
			.toEqual([])
		// Spawns a real TypeScript program; the default 5s timeout is too tight on
		// slower CI runners (Linux/Windows), so give the compile ample headroom.
	}, 60_000)
})
