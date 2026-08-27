import type { DiagnosticHandler, TypegenJSDocRenderBindings, TypegenRenderUnit, TypegenSnapshot } from '@pikacss/core'
import type { ProjectGeneration } from './projectRuntime'
import { createHash } from 'node:crypto'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { renderTypegenDocument } from '@pikacss/core'
import { join, normalize } from 'pathe'
import { replaceGeneratedFile } from './generatedFileWriter'

type TypegenPreviewAsset = TypegenSnapshot['previewAssets'][number]

export interface GeneratedStateHost {
	readonly publicEntryModule: string
	readonly previewHref?: (absolutePath: string) => string
	/** Host projection for Vue template-instance globals; never part of semantic snapshots. */
	readonly vueTemplateGlobals?: boolean
}

export interface GeneratedStatePublicationResult {
	readonly declarationPath: string
	readonly previewPaths: readonly string[]
	readonly previewBindingsByEntry: ReadonlyMap<number, ReadonlyMap<string, string>>
}

interface PublishGeneratedStateOptions {
	readonly host: GeneratedStateHost
	readonly onDiagnostic?: DiagnosticHandler
	readonly isCurrent?: () => boolean
}

const MEDIA_EXTENSIONS: Readonly<Record<string, string>> = Object.freeze({
	'image/svg+xml': 'svg',
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp',
	'image/gif': 'gif',
})

function encodePathSegments(path: string): string {
	return path.split('/')
		.map(segment => encodeURIComponent(segment))
		.join('/')
}

/** @internal */
export function previewMarkdownHref(absolutePath: string, platform = process.platform): string {
	if (platform === 'win32' || /^[A-Z]:[\\/]/i.test(absolutePath)) {
		const normalized = absolutePath.replaceAll('\\', '/')
		const drive = normalized.slice(0, 2)
		const rest = normalized.slice(2)
		return `file:///${drive}${encodePathSegments(rest)}`
	}
	return encodePathSegments(normalize(absolutePath))
}

function previewAssetFilename(asset: TypegenPreviewAsset): string {
	const hash = createHash('sha256')
		.update(asset.mediaType)
		.update('\0')
		.update(asset.content)
		.digest('hex')
	const extension = MEDIA_EXTENSIONS[asset.mediaType] ?? 'bin'
	return `${hash}.${extension}`
}

async function writePreviewAsset(path: string, content: string): Promise<void> {
	try {
		await writeFile(path, content, { flag: 'wx' })
	}
	catch (error: any) {
		if (error?.code !== 'EEXIST')
			throw error
		const existing = await stat(path)
		if (!existing.isFile())
			throw new Error(`Preview asset path is not a file: ${path}`)
	}
}

async function materializeEntryPreviewAssets(
	stateDir: string,
	entryIndex: number,
	assets: readonly TypegenPreviewAsset[],
	options: PublishGeneratedStateOptions,
): Promise<{ paths: string[], bindings: ReadonlyMap<string, string> }> {
	const previewDir = join(stateDir, 'previews')
	const bindings = new Map<string, string>()
	const paths: string[] = []

	for (const asset of assets) {
		const path = join(previewDir, previewAssetFilename(asset))
		try {
			await mkdir(previewDir, { recursive: true })
			await writePreviewAsset(path, asset.content)
			paths.push(path)
			bindings.set(asset.id, options.host.previewHref?.(path) ?? previewMarkdownHref(path))
		}
		catch (cause) {
			options.onDiagnostic?.({
				level: 'warning',
				code: 'typegen-preview-materialization-failed',
				message: `Failed to materialize Typegen preview asset "${asset.id}" for entry ${entryIndex}`,
				cause,
			})
		}
	}
	return { paths, bindings }
}

/**
 * Publishes one immutable ProjectGeneration's generated TypeScript state.
 * Supporting preview assets are best-effort; the canonical declaration is the
 * sole transaction commit artifact and is freshness-fenced at atomic rename.
 * @internal
 */
export async function publishGeneratedState(
	generation: ProjectGeneration,
	options: PublishGeneratedStateOptions,
): Promise<GeneratedStatePublicationResult> {
	const bindingsByEntry = new Map<number, ReadonlyMap<string, string>>()
	const previewPaths = new Set<string>()

	await Promise.all(generation.entries.map(async (entry) => {
		const materialized = await materializeEntryPreviewAssets(
			generation.config.stateDir,
			entry.index,
			entry.typegenSnapshot.previewAssets,
			options,
		)
		bindingsByEntry.set(entry.index, materialized.bindings)
		materialized.paths.forEach(path => previewPaths.add(path))
	}))

	const units: TypegenRenderUnit[] = generation.entries.map((entry) => {
		const bindings = bindingsByEntry.get(entry.index)!
		const hostBindings: TypegenJSDocRenderBindings = {
			resolvePreviewImageHref: assetId => bindings.get(assetId),
		}
		return {
			snapshot: entry.typegenSnapshot,
			fnName: entry.config.fnName,
			transformedFormat: entry.config.transformedFormat,
			publicModule: options.host.publicEntryModule,
			vueTemplateGlobals: options.host.vueTemplateGlobals,
			hostBindings,
		}
	})
	const content = renderTypegenDocument(units)
	const declarationPath = join(generation.config.stateDir, 'pika.gen.ts')
	await replaceGeneratedFile(
		declarationPath,
		content,
		join(generation.config.stateDir, 'tmp'),
		options.isCurrent,
	)

	return Object.freeze({
		declarationPath,
		previewPaths: Object.freeze([...previewPaths].sort()),
		previewBindingsByEntry: bindingsByEntry,
	})
}
