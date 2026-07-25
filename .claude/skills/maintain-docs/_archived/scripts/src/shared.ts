import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { globby } from 'globby'
import matter from 'gray-matter'
import { dirname, join, relative, resolve } from 'pathe'
import { simpleGit } from 'simple-git'

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

export const runtimeEntry = '.github/skills/maintain-docs/scripts'
export const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..')
export const docsRoot = resolve(workspaceRoot, 'docs')
export const docsExamplesRoot = resolve(docsRoot, '.examples')
export const docsZhTwRoot = resolve(docsRoot, 'zh-TW')
export const docsZhTwExamplesRoot = resolve(docsZhTwRoot, '.examples')
export const stateRoot = resolve(workspaceRoot, '.maintain-docs')
export const stateFilePath = resolve(stateRoot, 'state.json')
export const pageStatesDir = resolve(stateRoot, 'pages')
export const vitepressConfigPath = resolve(docsRoot, '.vitepress/config.ts')

export const directCommands = {
	analyze: `node ./${runtimeEntry}/bootstrap.mjs analyze`,
	translate: `node ./${runtimeEntry}/bootstrap.mjs translate`,
	install: `node ./${runtimeEntry}/bootstrap.mjs install`,
} as const

// ---------------------------------------------------------------------------
// Frontmatter schema
// ---------------------------------------------------------------------------

export interface DocsFrontmatter {
	relatedPackages: string[]
	relatedSources: string[]
	category: string
	order: number
	title?: string
	description?: string
	layout?: string
}

export interface HomeFrontmatter {
	layout: 'home'
	hero?: {
		name?: string
		text?: string
		tagline?: string
		image?: { src?: string, alt?: string }
		actions?: Array<{ theme?: string, text?: string, link?: string }>
	}
	features?: Array<{ icon?: string, title?: string, details?: string }>
}

export const validCategories = [
	'getting-started',
	'guide',
	'api',
	'config',
	'advanced',
	'contributing',
	'plugin-dev',
	'troubleshooting',
	'skills',
] as const

export type DocsCategory = typeof validCategories[number]

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

export interface PageState {
	pagePath: string
	lastVerifiedCommit: string | null
	lastVerifiedPageHash: string | null
	lastVerifiedSourceHashes: Record<string, string> | null
	driftStatus: 'synced' | 'drifted' | 'unknown'
	i18nSyncHash: string | null
	lastTranslatedFromHash: string | null
}

export interface GlobalState {
	schema: 'pikacss-maintain-docs-state'
	schemaVersion: 1
	generatedAt: string
	pages: Record<string, PageState>
}

// ---------------------------------------------------------------------------
// Drift report
// ---------------------------------------------------------------------------

export interface DriftReportEntry {
	pagePath: string
	relatedPackages: string[]
	relatedSources: string[]
	driftStatus: 'synced' | 'drifted' | 'unknown'
	changedSources: string[]
	category: string
}

export interface DriftReport {
	schema: 'pikacss-docs-drift-report'
	schemaVersion: 1
	generatedAt: string
	totalPages: number
	driftedPages: number
	syncedPages: number
	unknownPages: number
	entries: DriftReportEntry[]
}

// ---------------------------------------------------------------------------
// Scaffold report
// ---------------------------------------------------------------------------

export interface ScaffoldRecommendation {
	suggestedPath: string
	category: DocsCategory
	reason: string
	relatedPackages: string[]
	relatedSources: string[]
}

export interface ScaffoldReport {
	schema: 'pikacss-docs-scaffold-report'
	schemaVersion: 1
	generatedAt: string
	existingPages: number
	recommendations: ScaffoldRecommendation[]
}

// ---------------------------------------------------------------------------
// i18n status
// ---------------------------------------------------------------------------

export interface I18nStatusEntry {
	englishPath: string
	zhTwPath: string
	status: 'synced' | 'outdated' | 'missing'
	englishContentHash: string
	translatedFromHash: string | null
}

export interface I18nStatusReport {
	schema: 'pikacss-docs-i18n-status'
	schemaVersion: 1
	generatedAt: string
	totalEnglishPages: number
	syncedPages: number
	outdatedPages: number
	missingPages: number
	entries: I18nStatusEntry[]
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

export function toWorkspacePath(filePath: string): string {
	return relative(workspaceRoot, filePath)
}

export function toAbsolutePath(workspacePath: string): string {
	return resolve(workspaceRoot, workspacePath)
}

export function createContentHash(content: string): string {
	return createHash('sha256').update(content).digest('hex')
}

export function currentTimestamp(): string {
	return new Date().toISOString()
}

export function isDirectExecution(metaUrl: string): boolean {
	const entryFile = process.argv[1]
	if (!entryFile)
		return false
	return pathToFileURL(entryFile).href === metaUrl
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

export async function listDocsPages(root: string = docsRoot): Promise<string[]> {
	return globby(['**/*.md'], {
		cwd: root,
		absolute: true,
		onlyFiles: true,
		ignore: [
			'**/node_modules/**',
			'**/dist/**',
			'zh-TW/**',
			'.examples/**',
		],
		gitignore: true,
	})
}

export async function listZhTwPages(): Promise<string[]> {
	return globby(['**/*.md'], {
		cwd: docsZhTwRoot,
		absolute: true,
		onlyFiles: true,
		ignore: [
			'**/node_modules/**',
			'.examples/**',
		],
		gitignore: true,
	})
}

export async function listSourceFiles(): Promise<string[]> {
	return globby(['packages/*/src/**/*.{ts,tsx}'], {
		cwd: workspaceRoot,
		absolute: true,
		onlyFiles: true,
		ignore: [
			'**/dist/**',
			'**/coverage/**',
			'**/*.test.*',
			'**/*.spec.*',
			'**/pika.gen.*',
			'**/src/internal/generated-*.ts',
			'packages/core/src/csstype.ts',
		],
		gitignore: true,
	})
}

// ---------------------------------------------------------------------------
// Home page detection
// ---------------------------------------------------------------------------

export function isHomePage(filePath: string): boolean {
	const rel = toWorkspacePath(filePath)
	return rel === 'docs/index.md' || rel === 'docs/zh-TW/index.md'
}

export function isHomePageFrontmatter(data: Partial<DocsFrontmatter>): boolean {
	return data.layout === 'home'
}

// ---------------------------------------------------------------------------
// Frontmatter parsing
// ---------------------------------------------------------------------------

export function parseFrontmatter(filePath: string): { data: Partial<DocsFrontmatter>, content: string } {
	const raw = readFileSync(filePath, 'utf8')
	const { data, content } = matter(raw)
	return { data: data as Partial<DocsFrontmatter>, content }
}

export function validateFrontmatter(data: Partial<DocsFrontmatter>, filePath: string): string[] {
	// Home pages use layout: home with hero/features — skip standard validation
	if (isHomePage(filePath) || isHomePageFrontmatter(data))
		return []

	const errors: string[] = []
	const rel = toWorkspacePath(filePath)

	if (!data.relatedPackages || !Array.isArray(data.relatedPackages) || data.relatedPackages.length === 0)
		errors.push(`${rel}: missing or empty 'relatedPackages'`)

	if (!data.relatedSources || !Array.isArray(data.relatedSources) || data.relatedSources.length === 0)
		errors.push(`${rel}: missing or empty 'relatedSources'`)

	if (!data.category || !validCategories.includes(data.category as DocsCategory))
		errors.push(`${rel}: invalid or missing 'category' (got '${data.category}', expected one of: ${validCategories.join(', ')})`)

	if (data.order == null || typeof data.order !== 'number')
		errors.push(`${rel}: missing or non-numeric 'order'`)

	return errors
}

// ---------------------------------------------------------------------------
// Source map: docs ↔ source associations
// ---------------------------------------------------------------------------

export interface SourceMapAssociation {
	pagePath: string
	relatedPackages: string[]
	relatedSources: string[]
	category: string
	order: number
}

export async function buildSourceMap(): Promise<SourceMapAssociation[]> {
	const pages = await listDocsPages()
	const associations: SourceMapAssociation[] = []

	for (const page of pages) {
		// Home pages don't participate in source ↔ docs mapping
		if (isHomePage(page))
			continue

		const { data } = parseFrontmatter(page)
		associations.push({
			pagePath: toWorkspacePath(page),
			relatedPackages: data.relatedPackages ?? [],
			relatedSources: data.relatedSources ?? [],
			category: data.category ?? 'guide',
			order: data.order ?? 0,
		})
	}

	return associations
}

export function getRelatedSourcesForPage(associations: SourceMapAssociation[], pagePath: string): string[] {
	const match = associations.find(a => a.pagePath === pagePath)
	return match?.relatedSources ?? []
}

export function getPagesForSource(associations: SourceMapAssociation[], sourcePath: string): string[] {
	return associations
		.filter(a => a.relatedSources.includes(sourcePath))
		.map(a => a.pagePath)
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

export function createGitClient() {
	return simpleGit({ baseDir: workspaceRoot })
}

export async function getFileLastCommitHash(filePath: string): Promise<string | null> {
	const git = createGitClient()
	try {
		const log = await git.log({ file: filePath, maxCount: 1 })
		return log.latest?.hash ?? null
	}
	catch {
		return null
	}
}

export async function getFilesChangedSince(commitHash: string, filePaths: string[]): Promise<string[]> {
	const git = createGitClient()
	const changed: string[] = []

	for (const filePath of filePaths) {
		try {
			const diff = await git.diff(['--name-only', commitHash, 'HEAD', '--', filePath])
			if (diff.trim().length > 0)
				changed.push(filePath)
		}
		catch {
			changed.push(filePath)
		}
	}

	return changed
}

// ---------------------------------------------------------------------------
// State management
// ---------------------------------------------------------------------------

export async function loadState(): Promise<GlobalState> {
	try {
		const raw = await readFile(stateFilePath, 'utf8')
		return JSON.parse(raw) as GlobalState
	}
	catch {
		return {
			schema: 'pikacss-maintain-docs-state',
			schemaVersion: 1,
			generatedAt: currentTimestamp(),
			pages: {},
		}
	}
}

export async function saveState(state: GlobalState): Promise<void> {
	state.generatedAt = currentTimestamp()
	await mkdir(stateRoot, { recursive: true })
	await writeFile(stateFilePath, `${JSON.stringify(state, null, '\t')}\n`, 'utf8')
}

export function getPageState(state: GlobalState, pagePath: string): PageState {
	return state.pages[pagePath] ?? {
		pagePath,
		lastVerifiedCommit: null,
		lastVerifiedPageHash: null,
		lastVerifiedSourceHashes: null,
		driftStatus: 'unknown',
		i18nSyncHash: null,
		lastTranslatedFromHash: null,
	}
}

export async function getFileContentHash(filePath: string): Promise<string | null> {
	try {
		const content = await readFile(filePath, 'utf8')
		return createContentHash(content)
	}
	catch {
		return null
	}
}

export function setPageState(state: GlobalState, pageState: PageState): void {
	state.pages[pageState.pagePath] = pageState
}

// ---------------------------------------------------------------------------
// State file path helpers
// ---------------------------------------------------------------------------

export function pageStateFilePath(pagePath: string): string {
	return resolve(pageStatesDir, `${pagePath.replace(/\//g, '__')}.json`)
}

// ---------------------------------------------------------------------------
// Nav/Sidebar generation
// ---------------------------------------------------------------------------

export interface NavItem {
	text: string
	link: string
}

export interface SidebarGroup {
	text: string
	collapsed?: boolean
	items: Array<{ text: string, link: string }>
}

interface CategoryConfig {
	label: string
	directory: string
	navOrder: number
}

export const categoryRegistry: Record<string, CategoryConfig> = {
	'getting-started': { label: 'Getting Started', directory: 'getting-started', navOrder: 1 },
	'guide': { label: 'Guide', directory: 'guide', navOrder: 2 },
	'config': { label: 'Configuration', directory: 'config', navOrder: 3 },
	'api': { label: 'API Reference', directory: 'api', navOrder: 4 },
	'plugin-dev': { label: 'Plugin Developer API', directory: 'plugin-development', navOrder: 5 },
	'advanced': { label: 'Advanced', directory: 'advanced', navOrder: 6 },
	'troubleshooting': { label: 'Troubleshooting', directory: 'troubleshooting', navOrder: 7 },
	'contributing': { label: 'Contributing', directory: 'contributing', navOrder: 8 },
	'skills': { label: 'Skills', directory: 'skills', navOrder: 9 },
}

export async function generateNavAndSidebar(associations: SourceMapAssociation[]): Promise<{
	nav: NavItem[]
	sidebar: Record<string, SidebarGroup[]>
}> {
	const grouped = new Map<string, SourceMapAssociation[]>()

	for (const assoc of associations) {
		const cat = assoc.category
		if (!grouped.has(cat))
			grouped.set(cat, [])
		grouped.get(cat)!.push(assoc)
	}

	const nav: NavItem[] = []
	const sidebar: Record<string, SidebarGroup[]> = {}

	const sortedCategories = [...grouped.entries()]
		.sort(([a], [b]) => {
			const orderA = categoryRegistry[a]?.navOrder ?? 99
			const orderB = categoryRegistry[b]?.navOrder ?? 99
			return orderA - orderB
		})

	for (const [category, pages] of sortedCategories) {
		const config = categoryRegistry[category]
		if (!config)
			continue

		const sortedPages = pages.sort((a, b) => a.order - b.order)
		const firstPage = sortedPages[0]
		if (!firstPage)
			continue

		const linkBase = `/${config.directory}/`
		nav.push({ text: config.label, link: linkBase })

		const sidebarItems = sortedPages.map((p) => {
			const { data } = parseFrontmatter(toAbsolutePath(p.pagePath))
			return {
				text: data.title ?? p.pagePath.split('/').pop()?.replace(/\.md$/, '') ?? '',
				link: `/${toWorkspacePath(toAbsolutePath(p.pagePath)).replace(/^docs\//, '').replace(/\.md$/, '')}`,
			}
		})

		sidebar[linkBase] = [{ text: config.label, items: sidebarItems }]
	}

	return { nav, sidebar }
}

// ---------------------------------------------------------------------------
// Directory copy/reset helpers (for i18n)
// ---------------------------------------------------------------------------

export async function resetDirectory(targetDir: string, sourceDir: string): Promise<string[]> {
	await rm(targetDir, { recursive: true, force: true })
	await mkdir(targetDir, { recursive: true })

	const files = await globby(['**/*'], {
		cwd: sourceDir,
		absolute: false,
		onlyFiles: true,
		dot: true,
		ignore: ['**/node_modules/**'],
	})

	const copiedFiles: string[] = []

	for (const file of files) {
		const sourcePath = join(sourceDir, file)
		const targetPath = join(targetDir, file)
		await mkdir(dirname(targetPath), { recursive: true })
		const content = await readFile(sourcePath)
		await writeFile(targetPath, content)
		copiedFiles.push(file)
	}

	return copiedFiles
}

// ---------------------------------------------------------------------------
// Report output helpers
// ---------------------------------------------------------------------------

export async function writeReport(reportPath: string, report: object): Promise<void> {
	await mkdir(dirname(reportPath), { recursive: true })
	await writeFile(reportPath, `${JSON.stringify(report, null, '\t')}\n`, 'utf8')
}
