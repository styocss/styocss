import { existsSync, readFileSync } from 'node:fs'
import process from 'node:process'
import { resolve } from 'pathe'
import {
	type DriftReport,
	type DriftReportEntry,
	type ScaffoldRecommendation,
	type ScaffoldReport,
	buildSourceMap,
	createContentHash,
	currentTimestamp,
	docsRoot,
	getFileContentHash,
	getFileLastCommitHash,
	getFilesChangedSince,
	getRelatedSourcesForPage,
	getPageState,
	isDirectExecution,
	listDocsPages,
	listSourceFiles,
	loadState,
	saveState,
	setPageState,
	stateRoot,
	toAbsolutePath,
	toWorkspacePath,
	writeReport,
} from './shared.js'

// ---------------------------------------------------------------------------
// Unified analysis report
// ---------------------------------------------------------------------------

export interface AnalyzeReport {
	schema: 'pikacss-docs-analyze-report'
	schemaVersion: 1
	generatedAt: string
	scaffold: ScaffoldReport
	drift: DriftReport
	contracts: ContractReport
}

export interface ContractIssue {
	severity: 'error' | 'warning'
	area: 'brief' | 'api-generator' | 'skills-boundary'
	filePath: string
	message: string
}

export interface ContractReport {
	schema: 'pikacss-docs-contract-report'
	schemaVersion: 1
	generatedAt: string
	errorCount: number
	warningCount: number
	issues: ContractIssue[]
}

const priorityBriefPaths = [
	'.github/skills/maintain-docs/references/page-briefs/learn/configuration/index.md',
	'.github/skills/maintain-docs/references/page-briefs/learn/integrations/vite.md',
	'.github/skills/maintain-docs/references/page-briefs/learn/integrations/nuxt.md',
	'.github/skills/maintain-docs/references/page-briefs/learn/core-features/index.md',
	'.github/skills/maintain-docs/references/page-briefs/learn/patterns/index.md',
	'.github/skills/maintain-docs/references/page-briefs/learn/plugins/index.md',
	'.github/skills/maintain-docs/references/page-briefs/reference/api/index.md',
	'.github/skills/maintain-docs/references/page-briefs/help/skills/index.md',
] as const

const requiredBriefSections = [
	'## Mental model',
	'## Validation',
	'## Common pitfalls',
	'## Required API links',
] as const

// ---------------------------------------------------------------------------
// Package detection
// ---------------------------------------------------------------------------

function extractPackageFromSource(sourcePath: string): string | null {
	const match = sourcePath.match(/^packages\/([^/]+)\//)
	return match ? match[1] : null
}

function packageNameFromFolder(folder: string): string {
	return folder === 'core' ? '@pikacss/core' : `@pikacss/${folder}`
}

// ---------------------------------------------------------------------------
// Page existence check
// ---------------------------------------------------------------------------

function existingDocsPagePaths(pages: string[], docsRootPath: string): Set<string> {
	const paths = new Set<string>()
	for (const page of pages) {
		const rel = page.replace(docsRootPath + '/', '')
		paths.add(rel)
	}
	return paths
}

// ---------------------------------------------------------------------------
// Contract analysis
// ---------------------------------------------------------------------------

function generatorWritesPackagePages(generatorSource: string): boolean {
	return generatorSource.includes('renderPackagePage(')
		&& generatorSource.includes('packageOutputPath(')
		&& generatorSource.includes('for (const info of packages)')
}

async function analyzeContracts(): Promise<ContractReport> {
	const issues: ContractIssue[] = []

	for (const briefPath of priorityBriefPaths) {
		const absPath = toAbsolutePath(briefPath)
		if (!existsSync(absPath)) {
			issues.push({
				severity: 'error',
				area: 'brief',
				filePath: briefPath,
				message: 'Priority brief is missing.',
			})
			continue
		}

		const content = readFileSync(absPath, 'utf8')
		for (const section of requiredBriefSections) {
			if (!content.includes(section)) {
				issues.push({
					severity: 'error',
					area: 'brief',
					filePath: briefPath,
					message: `Missing required brief section: ${section}`,
				})
			}
		}
	}

	const generatorPath = 'scripts/gen-api-docs.ts'
	const generatorAbsPath = toAbsolutePath(generatorPath)
	if (!existsSync(generatorAbsPath)) {
		issues.push({
			severity: 'error',
			area: 'api-generator',
			filePath: generatorPath,
			message: 'API generator script is missing.',
		})
	}
	else {
		const generatorSource = readFileSync(generatorAbsPath, 'utf8')

		if (!generatorWritesPackagePages(generatorSource)) {
			issues.push({
				severity: 'error',
				area: 'api-generator',
				filePath: generatorPath,
				message: 'API generator only writes overview pages. Package pages are not generator-owned yet.',
			})
		}

		if (!generatorSource.includes('AUTO-GENERATED')) {
			issues.push({
				severity: 'warning',
				area: 'api-generator',
				filePath: generatorPath,
				message: 'API generator does not emit an explicit generated marker string.',
			})
		}
	}

	const docsPages = await listDocsPages()
	for (const page of docsPages) {
		const relPath = toWorkspacePath(page)
		if (!relPath.startsWith('docs/api/') || relPath === 'docs/api/index.md')
			continue

		const content = readFileSync(page, 'utf8')
		if (!content.toLowerCase().includes('generated')) {
			issues.push({
				severity: 'warning',
				area: 'api-generator',
				filePath: relPath,
				message: 'Package-level API page is not marked as generated.',
			})
		}
	}

	const zhTwApiPages = await listDocsPages(resolve(docsRoot, 'zh-TW'))
	for (const page of zhTwApiPages) {
		const relPath = toWorkspacePath(page)
		if (!relPath.startsWith('docs/zh-TW/api/') || relPath === 'docs/zh-TW/api/index.md')
			continue

		const content = readFileSync(page, 'utf8')
		if (!content.toLowerCase().includes('generated')) {
			issues.push({
				severity: 'warning',
				area: 'api-generator',
				filePath: relPath,
				message: 'Package-level API page is not marked as generated.',
			})
		}
	}

	const skillsBoundaryChecks = [
		'docs/skills/index.md',
		'docs/zh-TW/skills/index.md',
	] as const
	const forbiddenSkillsTerms = [
		'repository workflow',
		'exported-surface',
		'maintain-docs',
		'maintain-tests',
	] as const

	for (const pagePath of skillsBoundaryChecks) {
		const absPath = toAbsolutePath(pagePath)
		if (!existsSync(absPath))
			continue

		const content = readFileSync(absPath, 'utf8').toLowerCase()
		for (const term of forbiddenSkillsTerms) {
			if (!content.includes(term))
				continue

			issues.push({
				severity: 'warning',
				area: 'skills-boundary',
				filePath: pagePath,
				message: `Public Skills page still references internal-only workflow language: ${term}`,
			})
		}
	}

	return {
		schema: 'pikacss-docs-contract-report',
		schemaVersion: 1,
		generatedAt: currentTimestamp(),
		errorCount: issues.filter(issue => issue.severity === 'error').length,
		warningCount: issues.filter(issue => issue.severity === 'warning').length,
		issues,
	}
}

// ---------------------------------------------------------------------------
// Scaffold analyzer
// ---------------------------------------------------------------------------

async function analyzeForMissingPages(): Promise<ScaffoldReport> {
	const sourceFiles = await listSourceFiles()
	const docsPages = await listDocsPages()
	const associations = await buildSourceMap()
	const existingPaths = existingDocsPagePaths(docsPages, docsRoot)

	const recommendations: ScaffoldRecommendation[] = []

	// Group source files by package
	const packageSources = new Map<string, string[]>()
	for (const src of sourceFiles) {
		const ws = toWorkspacePath(src)
		const pkg = extractPackageFromSource(ws)
		if (!pkg)
			continue
		if (!packageSources.has(pkg))
			packageSources.set(pkg, [])
		packageSources.get(pkg)!.push(ws)
	}

	// Check for packages without any docs coverage
	const documentedPackages = new Set<string>()
	for (const assoc of associations) {
		for (const pkg of assoc.relatedPackages) {
			documentedPackages.add(pkg)
		}
	}

	for (const [folder, sources] of packageSources) {
		const npmName = packageNameFromFolder(folder)

		// Plugin packages need a guide page
		if (folder.startsWith('plugin-')) {
			const expectedPath = `guide/plugins/${folder.replace('plugin-', '')}.md`
			if (!existingPaths.has(expectedPath)) {
				recommendations.push({
					suggestedPath: `docs/${expectedPath}`,
					category: 'guide',
					reason: `Plugin package ${npmName} has no guide page`,
					relatedPackages: [npmName],
					relatedSources: sources,
				})
			}
		}

		// Core package needs core concepts pages
		if (folder === 'core' && !documentedPackages.has(npmName)) {
			recommendations.push({
				suggestedPath: 'docs/guide/core-features/index.md',
				category: 'guide',
				reason: 'Core package has no documented core features',
				relatedPackages: [npmName],
				relatedSources: sources,
			})
		}

		// Integration package needs an integrations page
		if (folder === 'integration') {
			const expectedPath = 'guide/integrations/index.md'
			if (!existingPaths.has(expectedPath)) {
				recommendations.push({
					suggestedPath: `docs/${expectedPath}`,
					category: 'guide',
					reason: `Integration package ${npmName} has no guide page`,
					relatedPackages: [npmName],
					relatedSources: sources,
				})
			}
		}

		// Unplugin needs an integrations page
		if (folder === 'unplugin') {
			const expectedPath = 'guide/integrations/vite.md'
			if (!existingPaths.has(expectedPath)) {
				recommendations.push({
					suggestedPath: `docs/${expectedPath}`,
					category: 'guide',
					reason: `Unplugin package ${npmName} has no Vite integration guide`,
					relatedPackages: [npmName],
					relatedSources: sources,
				})
			}
		}

		// Nuxt needs its own integration page
		if (folder === 'nuxt') {
			const expectedPath = 'guide/integrations/nuxt.md'
			if (!existingPaths.has(expectedPath)) {
				recommendations.push({
					suggestedPath: `docs/${expectedPath}`,
					category: 'guide',
					reason: `Nuxt package ${npmName} has no integration guide`,
					relatedPackages: [npmName],
					relatedSources: sources,
				})
			}
		}

		// ESLint config needs a page
		if (folder === 'eslint-config') {
			const expectedPath = 'getting-started/eslint.md'
			if (!existingPaths.has(expectedPath)) {
				recommendations.push({
					suggestedPath: `docs/${expectedPath}`,
					category: 'getting-started',
					reason: `ESLint config package ${npmName} has no guide page`,
					relatedPackages: [npmName],
					relatedSources: sources,
				})
			}
		}

		// Every package should have a README
		const readmePath = `packages/${folder}/README.md`
		if (!existsSync(resolve(docsRoot, '..', readmePath))) {
			recommendations.push({
				suggestedPath: readmePath,
				category: 'getting-started',
				reason: `Package ${npmName} has no README.md`,
				relatedPackages: [npmName],
				relatedSources: [],
			})
		}
	}

	// Check for essential pages
	const essentialPages = [
		{ path: 'getting-started/index.md', category: 'getting-started' as const, reason: 'No getting started page' },
		{ path: 'guide/core-features/index.md', category: 'guide' as const, reason: 'No core features overview page' },
		{ path: 'guide/patterns/index.md', category: 'guide' as const, reason: 'No patterns page' },
		{ path: 'config/index.md', category: 'config' as const, reason: 'No config reference page' },
		{ path: 'advanced/index.md', category: 'advanced' as const, reason: 'No advanced topics page' },
		{ path: 'troubleshooting/index.md', category: 'troubleshooting' as const, reason: 'No troubleshooting page' },
		{ path: 'contributing/index.md', category: 'contributing' as const, reason: 'No contributing guide' },
		{ path: 'plugin-development/index.md', category: 'plugin-dev' as const, reason: 'No plugin development guide' },
	]

	for (const page of essentialPages) {
		if (!existingPaths.has(page.path)) {
			recommendations.push({
				suggestedPath: `docs/${page.path}`,
				category: page.category,
				reason: page.reason,
				relatedPackages: [],
				relatedSources: [],
			})
		}
	}

	return {
		schema: 'pikacss-docs-scaffold-report',
		schemaVersion: 1,
		generatedAt: currentTimestamp(),
		existingPages: docsPages.length,
		recommendations,
	}
}

// ---------------------------------------------------------------------------
// Drift detection
// ---------------------------------------------------------------------------

async function detectDrift(scope?: { packages?: string[], files?: string[] }): Promise<DriftReport> {
	const associations = await buildSourceMap()
	const state = await loadState()

	const entries: DriftReportEntry[] = []

	for (const assoc of associations) {
		// Filter by scope if provided
		if (scope?.packages && scope.packages.length > 0) {
			const hasMatch = assoc.relatedPackages.some(pkg => scope.packages!.includes(pkg))
			if (!hasMatch)
				continue
		}

		if (scope?.files && scope.files.length > 0) {
			const hasMatch = scope.files.some(f => assoc.pagePath.includes(f))
			if (!hasMatch)
				continue
		}

		const pageState = getPageState(state, assoc.pagePath)
		const sourcePaths = assoc.relatedSources.map(s => toAbsolutePath(s))

		let driftStatus: 'synced' | 'drifted' | 'unknown' = 'unknown'
		let changedSources: string[] = []

		if (pageState.lastVerifiedSourceHashes) {
			for (const sourcePath of sourcePaths) {
				const currentHash = await getFileContentHash(sourcePath)
				const previousHash = pageState.lastVerifiedSourceHashes[toWorkspacePath(sourcePath)]
				if (!currentHash || !previousHash || currentHash !== previousHash)
					changedSources.push(sourcePath)
			}

			driftStatus = changedSources.length === 0 ? 'synced' : 'drifted'
		}
		else if (pageState.lastVerifiedCommit) {
			// Stage 1: Git hash screening
			changedSources = await getFilesChangedSince(pageState.lastVerifiedCommit, sourcePaths)

			if (changedSources.length === 0) {
				driftStatus = 'synced'
			}
			else {
				// Stage 2: Content analysis would go deeper here
				// For now, any git-level change counts as drift
				driftStatus = 'drifted'
			}
		}

		entries.push({
			pagePath: assoc.pagePath,
			relatedPackages: assoc.relatedPackages,
			relatedSources: assoc.relatedSources,
			driftStatus,
			changedSources: changedSources.map(s => toWorkspacePath(s)),
			category: assoc.category,
		})
	}

	return {
		schema: 'pikacss-docs-drift-report',
		schemaVersion: 1,
		generatedAt: currentTimestamp(),
		totalPages: entries.length,
		driftedPages: entries.filter(e => e.driftStatus === 'drifted').length,
		syncedPages: entries.filter(e => e.driftStatus === 'synced').length,
		unknownPages: entries.filter(e => e.driftStatus === 'unknown').length,
		entries,
	}
}

// ---------------------------------------------------------------------------
// Mark pages as verified
// ---------------------------------------------------------------------------

async function markPagesVerified(pagePaths: string[]): Promise<void> {
	const associations = await buildSourceMap()
	const state = await loadState()

	for (const pagePath of pagePaths) {
		const commitHash = await getFileLastCommitHash(toAbsolutePath(pagePath))
		const pageState = getPageState(state, pagePath)
		const relatedSources = getRelatedSourcesForPage(associations, pagePath)

		const pageAbsPath = toAbsolutePath(pagePath)
		let contentHash: string | null = null
		try {
			contentHash = createContentHash(readFileSync(pageAbsPath, 'utf8'))
		}
		catch {
			// page may not exist yet
		}

		const sourceHashes: Record<string, string> = {}
		for (const sourcePath of relatedSources) {
			const absSourcePath = toAbsolutePath(sourcePath)
			const sourceHash = await getFileContentHash(absSourcePath)
			if (sourceHash)
				sourceHashes[sourcePath] = sourceHash
		}

		setPageState(state, {
			...pageState,
			lastVerifiedCommit: commitHash,
			lastVerifiedPageHash: contentHash,
			lastVerifiedSourceHashes: Object.keys(sourceHashes).length > 0 ? sourceHashes : null,
			driftStatus: 'synced',
			i18nSyncHash: contentHash,
		})
	}

	await saveState(state)
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

async function main() {
	const args = process.argv.slice(2)

	const packagesIdx = args.indexOf('--packages')
	const filesIdx = args.indexOf('--files')
	const markVerifiedIdx = args.indexOf('--mark-verified')

	if (markVerifiedIdx !== -1) {
		const pagePaths = args.slice(markVerifiedIdx + 1)
		if (pagePaths.length === 0) {
			console.error('--mark-verified requires at least one page path')
			process.exit(1)
		}
		await markPagesVerified(pagePaths)
		console.log(`Marked ${pagePaths.length} page(s) as verified.`)
		return
	}

	const scope: { packages?: string[], files?: string[] } = {}

	if (packagesIdx !== -1) {
		const nextFlagIdx = args.findIndex((a, i) => i > packagesIdx && a.startsWith('--'))
		const end = nextFlagIdx === -1 ? args.length : nextFlagIdx
		scope.packages = args.slice(packagesIdx + 1, end)
	}

	if (filesIdx !== -1) {
		const nextFlagIdx = args.findIndex((a, i) => i > filesIdx && a.startsWith('--'))
		const end = nextFlagIdx === -1 ? args.length : nextFlagIdx
		scope.files = args.slice(filesIdx + 1, end)
	}

	const hasScope = scope.packages || scope.files

	console.log('Running unified analysis (missing pages + drift detection + contract checks)...\n')

	const [scaffoldReport, driftReport, contractReport] = await Promise.all([
		analyzeForMissingPages(),
		detectDrift(hasScope ? scope : undefined),
		analyzeContracts(),
	])

	const report: AnalyzeReport = {
		schema: 'pikacss-docs-analyze-report',
		schemaVersion: 1,
		generatedAt: currentTimestamp(),
		scaffold: scaffoldReport,
		drift: driftReport,
		contracts: contractReport,
	}

	const reportPath = resolve(stateRoot, 'analyze-report.json')
	const contractReportPath = resolve(stateRoot, 'contract-report.json')
	await writeReport(reportPath, report)
	await writeReport(contractReportPath, contractReport)

	// Print scaffold results
	console.log(`--- Missing Pages ---`)
	console.log(`Existing pages: ${scaffoldReport.existingPages}`)
	console.log(`Recommendations: ${scaffoldReport.recommendations.length}`)
	if (scaffoldReport.recommendations.length > 0) {
		for (const rec of scaffoldReport.recommendations) {
			console.log(`  - ${rec.suggestedPath} (${rec.reason})`)
		}
	}
	console.log()

	// Print drift results
	console.log(`--- Drift Detection ---`)
	console.log(`Total pages: ${driftReport.totalPages}`)
	console.log(`Synced: ${driftReport.syncedPages}`)
	console.log(`Drifted: ${driftReport.driftedPages}`)
	console.log(`Unknown: ${driftReport.unknownPages}`)

	const drifted = driftReport.entries.filter(e => e.driftStatus === 'drifted')
	const unknown = driftReport.entries.filter(e => e.driftStatus === 'unknown')

	if (drifted.length > 0) {
		console.log('\nDrifted pages:')
		for (const entry of drifted) {
			console.log(`  - ${entry.pagePath}`)
			console.log(`    Changed sources: ${entry.changedSources.join(', ')}`)
		}
	}

	if (unknown.length > 0) {
		console.log('\nPages with unknown status (never verified):')
		for (const entry of unknown) {
			console.log(`  - ${entry.pagePath}`)
		}
	}

	console.log(`\n--- Contract Checks ---`)
	console.log(`Errors: ${contractReport.errorCount}`)
	console.log(`Warnings: ${contractReport.warningCount}`)

	if (contractReport.issues.length > 0) {
		for (const issue of contractReport.issues) {
			console.log(`  - [${issue.severity}] ${issue.filePath}: ${issue.message}`)
		}
	}

	console.log(`\nReport written to: ${toWorkspacePath(reportPath)}`)
	console.log(`Contract report written to: ${toWorkspacePath(contractReportPath)}`)
}

if (isDirectExecution(import.meta.url)) {
	main().catch((error) => {
		console.error(error)
		process.exit(1)
	})
}

export { analyzeContracts, analyzeForMissingPages, detectDrift, markPagesVerified }
