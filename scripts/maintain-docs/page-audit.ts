import type { DocsPageIdentity } from '../../docs/.vitepress/sidebarAndNav'
import type { TaskFile } from './shared'
import { existsSync, readFileSync } from 'node:fs'
import { globby } from 'globby'
import { resolve } from 'pathe'
import { pageRegistry } from '../../docs/.vitepress/sidebarAndNav'
import {
	discoverTemplates,
	docsRoot,
	extractDocsTableProperties,
	extractHeadings,
	extractTemplateHeadings,
	extractTemplateTableProperties,
	parseFrontmatter,
	relatedSourceIssues,
	sectionMap,
	templatePathToDocsPath,
	templatesRoot,
	validCategories,
	workspaceRoot,
} from './shared'

const RE_HEADING_LEVEL = /^(#+)/
const RE_HEADING_PREFIX = /^#+\s*/
const RE_HTML_COMMENT = /<!--.*?-->/g
const RE_HEADING_ID = /\{#.*?\}/g
const RE_NEXT_SECTION = /^##\s+Next\b/

export interface DocsAnalysisSummary {
	missing: number
	outdated: number
	ok: number
}

export interface DocsAnalysisReport {
	tasks: TaskFile[]
	summary: DocsAnalysisSummary
	registryIssues: string[]
}

function docsPathToRoute(docsPath: string): string {
	const relativePath = docsPath.replace(/^docs\//, '')
		.replace(/\.md$/, '')
	if (relativePath.endsWith('/index'))
		return `/${relativePath.slice(0, -'/index'.length)}/`
	return `/${relativePath}`
}

function findPageIdentity(docsPath: string): DocsPageIdentity | undefined {
	const route = docsPathToRoute(docsPath)
	return pageRegistry.find(page => page.path === route)
}

function isGeneratedApiRoute(route: string): boolean {
	return route.startsWith('/api/') && route !== '/api/'
}

export function handAuthoredInventoryIssues(
	templateDocsPaths: readonly string[],
	handAuthoredDocsPaths: readonly string[],
): string[] {
	const issues: string[] = []
	const templateSet = new Set(templateDocsPaths)
	const docsSet = new Set(handAuthoredDocsPaths)
	const registeredHandAuthoredPaths = pageRegistry
		.filter(page => !isGeneratedApiRoute(page.path))
		.map(page => page.path)

	for (const docsPath of handAuthoredDocsPaths) {
		if (!templateSet.has(docsPath))
			issues.push(`Hand-authored docs page is missing a template: ${docsPath}`)
		if (findPageIdentity(docsPath) == null)
			issues.push(`Hand-authored docs page is missing from the page registry: ${docsPathToRoute(docsPath)}`)
	}

	for (const docsPath of templateDocsPaths) {
		if (!docsSet.has(docsPath))
			issues.push(`Docs template has no hand-authored page: ${docsPath}`)
	}

	for (const route of registeredHandAuthoredPaths) {
		const docsPath = route.endsWith('/')
			? `docs/${route.slice(1)}index.md`
			: `docs/${route.slice(1)}.md`
		if (!templateSet.has(docsPath))
			issues.push(`Hand-authored page registry entry is missing a template: ${route}`)
	}

	return issues
}

async function discoverHandAuthoredDocsPaths(): Promise<string[]> {
	const paths = await globby('**/*.md', {
		cwd: docsRoot,
		ignore: ['node_modules/**', 'zh-tw/**', '.vitepress/**', '.examples/**'],
	})
	return paths
		.filter(path => path !== 'index.md' && (!path.startsWith('api/') || path === 'api/index.md'))
		.map(path => `docs/${path}`)
		.sort()
}

export function checkPageRegistry(): string[] {
	const issues: string[] = []
	const seenPaths = new Set<string>()
	const seenOrders = new Set<string>()

	for (const page of pageRegistry) {
		if (seenPaths.has(page.path))
			issues.push(`Duplicate page registry path: ${page.path}`)
		seenPaths.add(page.path)

		const orderKey = `${page.category}:${page.order}`
		if (seenOrders.has(orderKey))
			issues.push(`Duplicate page registry order in ${page.category}: ${page.order}`)
		seenOrders.add(orderKey)

		if (!validCategories.includes(page.category as (typeof validCategories)[number]))
			issues.push(`Page registry category is invalid for ${page.path}: ${page.category}`)

		const relativeRoute = page.path.replace(/^\//, '')
			.replace(/\/$/, '/index')
		const docsPath = resolve(workspaceRoot, 'docs', `${relativeRoute}.md`)
		if (!existsSync(docsPath))
			issues.push(`Page registry target does not exist: ${page.path}`)
	}

	return issues
}

function hasNonEmptyStringArray(value: unknown): value is string[] {
	return Array.isArray(value)
		&& value.length > 0
		&& value.every(item => typeof item === 'string' && item.trim().length > 0)
}

export function checkFrontmatter(content: string, expectedIdentity?: Pick<DocsPageIdentity, 'category' | 'order'>): string[] {
	const fm = parseFrontmatter(content)
	const issues: string[] = []

	if (!fm.title)
		issues.push('Frontmatter missing \'title\'')
	if (!fm.description)
		issues.push('Frontmatter missing \'description\'')
	if (!hasNonEmptyStringArray(fm.relatedPackages))
		issues.push('Frontmatter missing or empty \'relatedPackages\'')
	if (!hasNonEmptyStringArray(fm.relatedSources))
		issues.push('Frontmatter missing or empty \'relatedSources\'')
	if (!fm.category) {
		issues.push('Frontmatter missing \'category\'')
	}
	else if (!validCategories.includes(fm.category as (typeof validCategories)[number])) {
		issues.push(`Frontmatter 'category' is '${fm.category}' — not a valid category`)
	}
	else if (expectedIdentity != null && fm.category !== expectedIdentity.category) {
		issues.push(`Frontmatter 'category' is '${fm.category}' — expected '${expectedIdentity.category}' from the page registry`)
	}
	if (typeof fm.order !== 'number' || !Number.isFinite(fm.order)) {
		issues.push('Frontmatter missing or invalid \'order\'')
	}
	else if (expectedIdentity != null && fm.order !== expectedIdentity.order) {
		issues.push(`Frontmatter 'order' is '${fm.order}' — expected '${expectedIdentity.order}' from the page registry`)
	}

	return issues
}

export function checkHeadingConformity(templateContent: string, docsContent: string): string[] {
	const templateHeadings = extractTemplateHeadings(templateContent)
	const docsHeadings = extractHeadings(docsContent)
		.filter(h => !h.startsWith('# '))
	const issues: string[] = []

	for (const th of templateHeadings) {
		const level = th.match(RE_HEADING_LEVEL)?.[1] || ''
		const text = th.replace(RE_HEADING_PREFIX, '')
			.replace(RE_HTML_COMMENT, '')
			.trim()

		if (!text)
			continue

		const found = docsHeadings.some((dh) => {
			const dText = dh.replace(RE_HEADING_PREFIX, '')
				.replace(RE_HEADING_ID, '')
				.trim()
			const dLevel = dh.match(RE_HEADING_LEVEL)?.[1] || ''
			return dLevel === level && dText === text
		})

		if (!found)
			issues.push(`Missing heading: ${th}`)
	}

	return issues
}

export function checkNextSection(content: string): string | null {
	const headings = extractHeadings(content)
	const hasNext = headings.some(h => RE_NEXT_SECTION.test(h))
	if (!hasNext)
		return 'Missing ## Next section'
	return null
}

export function checkTablePropertyConformity(templateContent: string, docsContent: string): string[] {
	const templateProps = extractTemplateTableProperties(templateContent)
	if (templateProps.length === 0)
		return []

	const docsProps = extractDocsTableProperties(docsContent)
	const issues: string[] = []

	for (const prop of templateProps) {
		if (!docsProps.includes(prop))
			issues.push(`Missing table property: ${prop}`)
	}

	return issues
}

export async function analyzeDocsPages(): Promise<DocsAnalysisReport> {
	const templateRelPaths = await discoverTemplates()
	const tasks: TaskFile[] = []
	const summary: DocsAnalysisSummary = { missing: 0, outdated: 0, ok: 0 }
	const templateDocsPaths = templateRelPaths.map(templatePathToDocsPath)
	const handAuthoredDocsPaths = await discoverHandAuthoredDocsPaths()
	const registryIssues = [
		...checkPageRegistry(),
		...handAuthoredInventoryIssues(templateDocsPaths, handAuthoredDocsPaths),
	]

	for (const tplRel of templateRelPaths) {
		const tplAbsPath = resolve(templatesRoot, tplRel)
		const docsRelPath = templatePathToDocsPath(tplRel)
		const docsAbsPath = resolve(workspaceRoot, docsRelPath)
		const sectionDir = tplRel.split('/')[0] || 'unknown'
		const section = sectionMap[sectionDir] || sectionDir
		const templatePath = `.claude/skills/maintain-docs/templates/pages/${tplRel}`

		if (!existsSync(docsAbsPath)) {
			const task: TaskFile = {
				templatePath,
				docsPath: docsRelPath,
				status: 'missing',
				section,
				issues: ['Page does not exist (missing)'],
				relatedSources: [],
			}
			tasks.push(task)
			summary.missing++
			continue
		}

		const templateContent = readFileSync(tplAbsPath, 'utf8')
		const docsContent = readFileSync(docsAbsPath, 'utf8')
		const identity = findPageIdentity(docsRelPath)
		const fm = parseFrontmatter(docsContent)
		const relatedSources = hasNonEmptyStringArray(fm.relatedSources) ? fm.relatedSources : []
		const issues = [
			...(identity == null ? [`Page is missing from docs/.vitepress/sidebarAndNav.ts registry: ${docsPathToRoute(docsRelPath)}`] : []),
			...checkFrontmatter(docsContent, identity),
			...relatedSourceIssues(relatedSources),
			...checkHeadingConformity(templateContent, docsContent),
			...checkTablePropertyConformity(templateContent, docsContent),
		]
		const nextIssue = checkNextSection(docsContent)
		if (nextIssue)
			issues.push(nextIssue)

		const status = issues.length > 0 ? 'outdated' : 'ok'
		const task: TaskFile = {
			templatePath,
			docsPath: docsRelPath,
			status,
			section,
			issues,
			relatedSources,
		}
		tasks.push(task)
		summary[status]++
	}

	return { tasks, summary, registryIssues }
}

export function printDocsAnalysis(report: DocsAnalysisReport): void {
	const { tasks, summary, registryIssues } = report
	console.log('\n=== Docs Analysis Summary ===\n')
	console.log(`Total pages:    ${tasks.length}`)
	console.log(`  OK:           ${summary.ok}`)
	console.log(`  Outdated:     ${summary.outdated}`)
	console.log(`  Missing:      ${summary.missing}`)
	console.log('')

	if (registryIssues.length > 0) {
		console.log('Page registry issues:')
		for (const issue of registryIssues)
			console.log(`  - ${issue}`)
		console.log('')
	}

	if (summary.missing > 0) {
		console.log('Missing pages:')
		for (const task of tasks.filter(task => task.status === 'missing'))
			console.log(`  - ${task.docsPath}`)
		console.log('')
	}

	if (summary.outdated > 0) {
		console.log('Outdated pages:')
		for (const task of tasks.filter(task => task.status === 'outdated')) {
			console.log(`  - ${task.docsPath}`)
			for (const issue of task.issues)
				console.log(`      • ${issue}`)
		}
		console.log('')
	}
}

export function hasDocsAnalysisFailures(report: DocsAnalysisReport): boolean {
	return report.tasks.length === 0
		|| report.registryIssues.length > 0
		|| report.summary.missing > 0
		|| report.summary.outdated > 0
}
