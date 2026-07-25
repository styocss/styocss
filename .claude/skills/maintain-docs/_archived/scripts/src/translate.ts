import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { resolve } from 'pathe'
import {
	type I18nStatusEntry,
	type I18nStatusReport,
	createContentHash,
	currentTimestamp,
	docsExamplesRoot,
	docsRoot,
	docsZhTwExamplesRoot,
	docsZhTwRoot,
	getPageState,
	isDirectExecution,
	listDocsPages,
	listZhTwPages,
	loadState,
	resetDirectory,
	saveState,
	setPageState,
	stateRoot,
	toWorkspacePath,
	writeReport,
} from './shared.js'

// ---------------------------------------------------------------------------
// i18n status detection
// ---------------------------------------------------------------------------

async function detectI18nStatus(scope?: { files?: string[] }): Promise<I18nStatusReport> {
	const englishPages = await listDocsPages()
	const zhTwPages = await listZhTwPages()
	const state = await loadState()

	const zhTwPageSet = new Set(
		zhTwPages.map(p => toWorkspacePath(p).replace(/^docs\/zh-TW\//, '')),
	)

	const entries: I18nStatusEntry[] = []

	for (const enPage of englishPages) {
		const enRelative = toWorkspacePath(enPage).replace(/^docs\//, '')

		// Filter by scope if provided
		if (scope?.files && scope.files.length > 0) {
			const hasMatch = scope.files.some(f => enRelative.includes(f))
			if (!hasMatch)
				continue
		}

		const zhTwPath = `docs/zh-TW/${enRelative}`
		const enContent = readFileSync(enPage, 'utf8')
		const enHash = createContentHash(enContent)

		const pageState = getPageState(state, `docs/${enRelative}`)

		let status: 'synced' | 'outdated' | 'missing'

		if (!zhTwPageSet.has(enRelative)) {
			status = 'missing'
		}
		else if (pageState.i18nSyncHash && pageState.lastTranslatedFromHash === enHash) {
			status = 'synced'
		}
		else {
			status = 'outdated'
		}

		entries.push({
			englishPath: `docs/${enRelative}`,
			zhTwPath,
			status,
			englishContentHash: enHash,
			translatedFromHash: pageState.lastTranslatedFromHash,
		})
	}

	return {
		schema: 'pikacss-docs-i18n-status',
		schemaVersion: 1,
		generatedAt: currentTimestamp(),
		totalEnglishPages: entries.length,
		syncedPages: entries.filter(e => e.status === 'synced').length,
		outdatedPages: entries.filter(e => e.status === 'outdated').length,
		missingPages: entries.filter(e => e.status === 'missing').length,
		entries,
	}
}

// ---------------------------------------------------------------------------
// Reset zh-TW files from English source
// ---------------------------------------------------------------------------

async function resetZhTwFiles(filePaths: string[]): Promise<string[]> {
	const copiedFiles: string[] = []

	for (const enRelativePath of filePaths) {
		// enRelativePath is like "getting-started/index.md"
		const enAbsPath = resolve(docsRoot, enRelativePath)
		const zhTwAbsPath = resolve(docsZhTwRoot, enRelativePath)

		if (!existsSync(enAbsPath)) {
			console.warn(`English source not found: ${enRelativePath}`)
			continue
		}

		const { mkdir, writeFile } = await import('node:fs/promises')
		const { dirname } = await import('pathe')
		await mkdir(dirname(zhTwAbsPath), { recursive: true })
		const content = await readFile(enAbsPath)
		await writeFile(zhTwAbsPath, content)
		copiedFiles.push(enRelativePath)
	}

	return copiedFiles
}

// ---------------------------------------------------------------------------
// Reset zh-TW examples
// ---------------------------------------------------------------------------

async function resetZhTwExamples(): Promise<string[]> {
	if (!existsSync(docsExamplesRoot))
		return []

	return resetDirectory(docsZhTwExamplesRoot, docsExamplesRoot)
}

// ---------------------------------------------------------------------------
// Mark translations as synced
// ---------------------------------------------------------------------------

async function markTranslationsSynced(pagePaths: string[]): Promise<void> {
	const state = await loadState()

	for (const pagePath of pagePaths) {
		const enRelative = pagePath.replace(/^docs\/zh-TW\//, '')
		const enAbsPath = resolve(docsRoot, enRelative)

		let enHash: string | null = null
		try {
			enHash = createContentHash(readFileSync(enAbsPath, 'utf8'))
		}
		catch {
			continue
		}

		const enPagePath = `docs/${enRelative}`
		const pageState = getPageState(state, enPagePath)
		setPageState(state, {
			...pageState,
			lastTranslatedFromHash: enHash,
		})
	}

	await saveState(state)
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

async function main() {
	const args = process.argv.slice(2)

	const statusMode = args.includes('--status') || args.length === 0
	const resetMode = args.includes('--reset')
	const resetExamplesMode = args.includes('--reset-examples')
	const markSyncedIdx = args.indexOf('--mark-synced')

	if (markSyncedIdx !== -1) {
		const pages = args.slice(markSyncedIdx + 1).filter(a => !a.startsWith('--'))
		if (pages.length === 0) {
			console.error('--mark-synced requires at least one page path')
			process.exit(1)
		}
		await markTranslationsSynced(pages)
		console.log(`Marked ${pages.length} translation(s) as synced.`)
		return
	}

	if (resetExamplesMode) {
		console.log('Resetting zh-TW examples...\n')
		const copied = await resetZhTwExamples()
		console.log(`Copied ${copied.length} example file(s) to zh-TW.`)
		return
	}

	if (resetMode) {
		console.log('Detecting pages to reset...\n')
		const report = await detectI18nStatus()
		const toReset = report.entries
			.filter(e => e.status === 'missing' || e.status === 'outdated')
			.map(e => e.englishPath.replace(/^docs\//, ''))

		if (toReset.length === 0) {
			console.log('All zh-TW pages are up to date.')
			return
		}

		console.log(`Resetting ${toReset.length} zh-TW page(s)...`)
		const copied = await resetZhTwFiles(toReset)
		console.log(`Copied ${copied.length} file(s).`)

		console.log('\nResetting zh-TW examples...')
		const examplesCopied = await resetZhTwExamples()
		console.log(`Copied ${examplesCopied.length} example file(s).`)

		console.log('\nFiles ready for translation:')
		for (const f of copied)
			console.log(`  - docs/zh-TW/${f}`)

		return
	}

	// Default: status mode
	console.log('Checking i18n sync status...\n')

	const report = await detectI18nStatus()
	const reportPath = resolve(stateRoot, 'i18n-status.json')
	await writeReport(reportPath, report)

	console.log(`Total English pages: ${report.totalEnglishPages}`)
	console.log(`Synced: ${report.syncedPages}`)
	console.log(`Outdated: ${report.outdatedPages}`)
	console.log(`Missing: ${report.missingPages}\n`)

	const missing = report.entries.filter(e => e.status === 'missing')
	const outdated = report.entries.filter(e => e.status === 'outdated')

	if (missing.length > 0) {
		console.log('Missing zh-TW pages:')
		for (const e of missing)
			console.log(`  - ${e.zhTwPath}`)
		console.log()
	}

	if (outdated.length > 0) {
		console.log('Outdated zh-TW pages:')
		for (const e of outdated)
			console.log(`  - ${e.zhTwPath}`)
		console.log()
	}

	console.log(`Report written to: ${toWorkspacePath(reportPath)}`)
}

if (isDirectExecution(import.meta.url)) {
	main().catch((error) => {
		console.error(error)
		process.exit(1)
	})
}

export { detectI18nStatus, markTranslationsSynced, resetZhTwExamples, resetZhTwFiles }
