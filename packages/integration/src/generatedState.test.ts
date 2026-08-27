import type { TypegenSnapshot } from '@pikacss/core'
import type { ProjectGeneration } from './projectRuntime'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { previewMarkdownHref, publishGeneratedState } from './generatedState'

type TypegenPreviewAsset = TypegenSnapshot['previewAssets'][number]

const created: string[] = []

async function createStateDir(): Promise<string> {
	const stateDir = await mkdtemp(join(tmpdir(), 'pikacss-generated-state-'))
	created.push(stateDir)
	return stateDir
}

function snapshot({
	id,
	declarations,
	previewAssets = [],
}: {
	id: string
	declarations?: string
	previewAssets?: readonly TypegenPreviewAsset[]
}): TypegenSnapshot {
	return Object.freeze({
		contributions: Object.freeze([Object.freeze({
			id,
			...(declarations == null ? {} : { declarations }),
		})]),
		previewAssets: Object.freeze([...previewAssets]),
	})
}

function generation(
	stateDir: string,
	entries: readonly {
		fnName: string
		transformedFormat: 'string' | 'array'
		snapshot: TypegenSnapshot
	}[],
): ProjectGeneration {
	return {
		config: { stateDir },
		entries: entries.map((entry, index) => ({
			index,
			config: {
				fnName: entry.fnName,
				transformedFormat: entry.transformedFormat,
			},
			typegenSnapshot: entry.snapshot,
		})),
	} as unknown as ProjectGeneration
}

function assetFilename(asset: TypegenPreviewAsset): string {
	const hash = createHash('sha256')
		.update(asset.mediaType)
		.update('\0')
		.update(asset.content)
		.digest('hex')
	return `${hash}.svg`
}

afterEach(async () => {
	await Promise.all(created.splice(0)
		.map(path => rm(path, { recursive: true, force: true })))
})

describe('generated-state publication (#150)', () => {
	it('renders all ordered Engine snapshots into the canonical project declaration', async () => {
		const stateDir = await createStateDir()
		const project = generation(stateDir, [
			{
				fnName: 'pika',
				transformedFormat: 'string',
				snapshot: snapshot({ id: 'a', declarations: 'type __A = { a: true }' }),
			},
			{
				fnName: 'admin',
				transformedFormat: 'array',
				snapshot: snapshot({ id: 'b', declarations: 'type __B = { b: true }' }),
			},
		])

		const result = await publishGeneratedState(project, {
			host: { publicEntryModule: '@consumer/pikacss' },
		})
		const content = await readFile(result.declarationPath, 'utf8')

		expect(result.declarationPath)
			.toBe(join(stateDir, 'pika.gen.ts'))
		expect(content)
			.toContain('declare namespace __PikaTypegenUnit0')
		expect(content)
			.toContain('declare namespace __PikaTypegenUnit1')
		expect(content)
			.toContain('const pika: __PikaTypegenUnit0.Pika')
		expect(content)
			.toContain('const admin: __PikaTypegenUnit1.Pika')
		expect(content)
			.toContain('import("@consumer/pikacss")')
		expect(content)
			.toContain('type __StyleFn = (...params: __StyleItem[]) => string[]')
	})

	it('content-addresses preview files globally while retaining entry-scoped asset bindings', async () => {
		const stateDir = await createStateDir()
		const first = Object.freeze({ id: 'first', mediaType: 'image/svg+xml', content: '<svg>same</svg>' })
		const second = Object.freeze({ id: 'second', mediaType: 'image/svg+xml', content: '<svg>same</svg>' })
		const project = generation(stateDir, [
			{ fnName: 'pika', transformedFormat: 'string', snapshot: snapshot({ id: 'a', previewAssets: [first] }) },
			{ fnName: 'admin', transformedFormat: 'string', snapshot: snapshot({ id: 'b', previewAssets: [second] }) },
		])

		const result = await publishGeneratedState(project, {
			host: {
				publicEntryModule: '@consumer/pikacss',
				previewHref: path => `preview:${path}`,
			},
		})

		expect(result.previewPaths)
			.toHaveLength(1)
		expect(await readFile(result.previewPaths[0]!, 'utf8'))
			.toBe(first.content)
		expect(result.previewBindingsByEntry.get(0)
			?.get('first'))
			.toBe(`preview:${result.previewPaths[0]}`)
		expect(result.previewBindingsByEntry.get(1)
			?.get('second'))
			.toBe(`preview:${result.previewPaths[0]}`)
	})

	it('reuses an existing immutable preview file and falls back to a binary extension for unknown media', async () => {
		const stateDir = await createStateDir()
		const asset = Object.freeze({ id: 'opaque', mediaType: 'application/x-pikacss-preview', content: 'opaque-bytes' })
		const project = generation(stateDir, [
			{ fnName: 'pika', transformedFormat: 'string', snapshot: snapshot({ id: 'a', previewAssets: [asset] }) },
		])

		const first = await publishGeneratedState(project, { host: { publicEntryModule: '@consumer/pikacss' } })
		expect(first.previewPaths[0])
			.toMatch(/\.bin$/)
		const firstPath = first.previewPaths[0]!
		const firstContent = await readFile(firstPath, 'utf8')

		const second = await publishGeneratedState(project, { host: { publicEntryModule: '@consumer/pikacss' } })
		expect(second.previewPaths)
			.toEqual([firstPath])
		expect(await readFile(firstPath, 'utf8'))
			.toBe(firstContent)
	})

	it('degrades all preview images when the preview directory itself cannot be created', async () => {
		const stateDir = await createStateDir()
		await writeFile(join(stateDir, 'previews'), 'blocks-preview-directory')
		const asset = Object.freeze({ id: 'blocked', mediaType: 'image/svg+xml', content: '<svg>blocked</svg>' })
		const onDiagnostic = vi.fn()
		const project = generation(stateDir, [
			{ fnName: 'pika', transformedFormat: 'string', snapshot: snapshot({ id: 'a', previewAssets: [asset] }) },
		])

		const result = await publishGeneratedState(project, {
			host: { publicEntryModule: '@consumer/pikacss' },
			onDiagnostic,
		})

		expect(result.previewPaths)
			.toEqual([])
		expect(result.previewBindingsByEntry.get(0)
			?.has('blocked'))
			.toBe(false)
		expect(onDiagnostic)
			.toHaveBeenCalledWith(expect.objectContaining({ code: 'typegen-preview-materialization-failed' }))
		expect(await readFile(result.declarationPath, 'utf8'))
			.toContain('const pika: __PikaTypegenUnit0.Pika')
	})

	it('warns and omits only a preview binding whose physical materialization fails', async () => {
		const stateDir = await createStateDir()
		const good = Object.freeze({ id: 'good', mediaType: 'image/svg+xml', content: '<svg>good</svg>' })
		const bad = Object.freeze({ id: 'bad', mediaType: 'image/svg+xml', content: '<svg>bad</svg>' })
		const previewDir = join(stateDir, 'previews')
		await mkdir(join(previewDir, assetFilename(bad)), { recursive: true })
		const onDiagnostic = vi.fn()
		const project = generation(stateDir, [
			{ fnName: 'pika', transformedFormat: 'string', snapshot: snapshot({ id: 'a', previewAssets: [good, bad] }) },
		])

		const result = await publishGeneratedState(project, {
			host: { publicEntryModule: '@consumer/pikacss' },
			onDiagnostic,
		})

		expect(result.previewBindingsByEntry.get(0)
			?.has('good'))
			.toBe(true)
		expect(result.previewBindingsByEntry.get(0)
			?.has('bad'))
			.toBe(false)
		expect(onDiagnostic)
			.toHaveBeenCalledWith(expect.objectContaining({
				level: 'warning',
				code: 'typegen-preview-materialization-failed',
			}))
		expect(await readFile(result.declarationPath, 'utf8'))
			.toContain('const pika: __PikaTypegenUnit0.Pika')
	})

	it('keeps the previous canonical declaration when the freshness fence closes before rename', async () => {
		const stateDir = await createStateDir()
		const declarationPath = join(stateDir, 'pika.gen.ts')
		await writeFile(declarationPath, '/* previous */')
		const project = generation(stateDir, [
			{ fnName: 'latest', transformedFormat: 'string', snapshot: snapshot({ id: 'latest' }) },
		])

		await publishGeneratedState(project, {
			host: { publicEntryModule: '@consumer/pikacss' },
			isCurrent: () => false,
		})

		expect(await readFile(declarationPath, 'utf8'))
			.toBe('/* previous */')
	})

	it('projects absolute preview hrefs without depending on the project-relative state path', () => {
		expect(previewMarkdownHref('/repo with space/.pikacss/previews/a.svg', 'linux'))
			.toBe('/repo%20with%20space/.pikacss/previews/a.svg')
		expect(previewMarkdownHref('C:\\repo with space\\.pikacss\\previews\\a.svg', 'win32'))
			.toBe('file:///C:/repo%20with%20space/.pikacss/previews/a.svg')
	})
})
