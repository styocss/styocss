import type { TaskFile } from './shared'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { resolve } from 'pathe'
import {
	discoverTemplates,
	extractDocsTableProperties,
	extractHeadings,
	extractTemplateHeadings,
	extractTemplateTableProperties,
	parseFrontmatter,
	relatedSourceIssues,
	sectionMap,

	tasksOutputRoot,
	templatePathToDocsPath,
	templatePathToTaskFileName,
	templatesRoot,
	validCategories,
	workspaceRoot,
} from './shared'

const RE_HEADING_LEVEL = /^(#+)/
const RE_HEADING_PREFIX = /^#+\s*/
const RE_HTML_COMMENT = /<!--.*?-->/g
const RE_HEADING_ID = /\{#.*?\}/g
const RE_NEXT_SECTION = /^##\s+Next\b/

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function checkPageExists(docsAbsPath: string): string | null {
	if (!existsSync(docsAbsPath))
		return 'Page does not exist (missing)'
	return null
}

function checkFrontmatter(content: string): string[] {
	const fm = parseFrontmatter(content)
	const issues: string[] = []

	if (!fm.title)
		issues.push('Frontmatter missing \'title\'')
	if (!fm.description)
		issues.push('Frontmatter missing \'description\'')
	if (!fm.category)
		issues.push('Frontmatter missing \'category\'')
	else if (!validCategories.includes(fm.category as any))
		issues.push(`Frontmatter 'category' is '${fm.category}' — not a valid category`)
	if (fm.order == null)
		issues.push('Frontmatter missing \'order\'')

	return issues
}

function checkHeadingConformity(templateContent: string, docsContent: string): string[] {
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

function checkNextSection(content: string): string | null {
	const headings = extractHeadings(content)
	const hasNext = headings.some(h => RE_NEXT_SECTION.test(h))
	if (!hasNext)
		return 'Missing ## Next section'
	return null
}

function checkTablePropertyConformity(templateContent: string, docsContent: string): string[] {
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	const templateRelPaths = await discoverTemplates()

	if (templateRelPaths.length === 0) {
		console.log('No templates found in templates/pages/.')
		return
	}

	await mkdir(tasksOutputRoot, { recursive: true })

	const tasks: TaskFile[] = []
	const summary = { missing: 0, outdated: 0, ok: 0 }

	for (const tplRel of templateRelPaths) {
		const tplAbsPath = resolve(templatesRoot, tplRel)
		const docsRelPath = templatePathToDocsPath(tplRel)
		const docsAbsPath = resolve(workspaceRoot, docsRelPath)
		const taskFileName = templatePathToTaskFileName(tplRel)

		const sectionDir = tplRel.split('/')[0] || 'unknown'
		const section = sectionMap[sectionDir] || sectionDir

		const templateContent = readFileSync(tplAbsPath, 'utf8')
		const issues: string[] = []

		// Check 1: Page existence
		const existsIssue = checkPageExists(docsAbsPath)
		if (existsIssue) {
			issues.push(existsIssue)
			const task: TaskFile = {
				templatePath: `.claude/skills/maintain-docs/templates/pages/${tplRel}`,
				docsPath: docsRelPath,
				status: 'missing',
				section,
				issues,
				relatedSources: [],
			}
			tasks.push(task)
			summary.missing++

			const taskPath = resolve(tasksOutputRoot, taskFileName)
			await writeFile(taskPath, `${JSON.stringify(task, null, '\t')}\n`, 'utf8')
			continue
		}

		const docsContent = readFileSync(docsAbsPath, 'utf8')

		// Check 2: Frontmatter validation
		issues.push(...checkFrontmatter(docsContent))
		issues.push(...relatedSourceIssues(parseFrontmatter(docsContent).relatedSources))

		// Check 3: Heading conformity
		issues.push(...checkHeadingConformity(templateContent, docsContent))

		// Check 4: Table property conformity
		issues.push(...checkTablePropertyConformity(templateContent, docsContent))

		// Check 5: ## Next section
		const nextIssue = checkNextSection(docsContent)
		if (nextIssue)
			issues.push(nextIssue)

		const fm = parseFrontmatter(docsContent)

		const status = issues.length > 0 ? 'outdated' : 'ok'
		const task: TaskFile = {
			templatePath: `.claude/skills/maintain-docs/templates/pages/${tplRel}`,
			docsPath: docsRelPath,
			status,
			section,
			issues,
			relatedSources: fm.relatedSources || [],
		}
		tasks.push(task)
		summary[status]++

		const taskPath = resolve(tasksOutputRoot, taskFileName)
		await writeFile(taskPath, `${JSON.stringify(task, null, '\t')}\n`, 'utf8')
	}

	// Stdout summary
	console.log('\n=== Docs Analysis Summary ===\n')
	console.log(`Total pages:    ${tasks.length}`)
	console.log(`  OK:           ${summary.ok}`)
	console.log(`  Outdated:     ${summary.outdated}`)
	console.log(`  Missing:      ${summary.missing}`)
	console.log('')

	if (summary.missing > 0) {
		console.log('Missing pages:')
		for (const t of tasks.filter(t => t.status === 'missing'))
			console.log(`  - ${t.docsPath}`)
		console.log('')
	}

	if (summary.outdated > 0) {
		console.log('Outdated pages:')
		for (const t of tasks.filter(t => t.status === 'outdated')) {
			console.log(`  - ${t.docsPath}`)
			for (const issue of t.issues)
				console.log(`      • ${issue}`)
		}
		console.log('')
	}

	console.log(`Task files written to: .maintain-docs/tasks/`)
}

main()
	.catch((error) => {
		console.error(error)
		process.exit(1)
	})
