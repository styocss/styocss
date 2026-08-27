import { existsSync } from 'node:fs'
import { globby } from 'globby'
import matter from 'gray-matter'
import { resolve } from 'pathe'
import { workspaceRoot } from '../_skill-shared'

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

export { workspaceRoot }
export const docsRoot = resolve(workspaceRoot, 'docs')
export const skillRoot = resolve(workspaceRoot, '.claude/skills/maintain-docs')
export const templatesRoot = resolve(skillRoot, 'templates/pages')
export const tasksOutputRoot = resolve(workspaceRoot, '.maintain-docs/tasks')

// ---------------------------------------------------------------------------
// Valid categories (aligned with content-architecture.md)
// ---------------------------------------------------------------------------

export const validCategories = [
	'getting-started',
	'integrations',
	'customizations',
	'official-plugins',
	'plugin-development',
	'api',
	'troubleshooting',
] as const

export type DocsCategory = typeof validCategories[number]

// ---------------------------------------------------------------------------
// Frontmatter schema
// ---------------------------------------------------------------------------

export interface DocsFrontmatter {
	title?: string
	description?: string
	relatedPackages?: string[]
	relatedSources?: string[]
	category?: string
	order?: number
	layout?: string
}

// ---------------------------------------------------------------------------
// Task file schema
// ---------------------------------------------------------------------------

export interface TaskFile {
	templatePath: string
	docsPath: string
	status: 'missing' | 'outdated' | 'ok'
	section: string
	issues: string[]
	relatedSources: string[]
}

// ---------------------------------------------------------------------------
// Section map (template directory name -> display name)
// ---------------------------------------------------------------------------

export const sectionMap: Record<string, string> = {
	'getting-started': 'Getting Started',
	'integrations': 'Integrations',
	'customizations': 'Customizations',
	'official-plugins': 'Official Plugins',
	'plugin-development': 'Plugin Development',
	'api': 'API Reference',
	'troubleshooting': 'Troubleshooting',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export async function discoverTemplates(): Promise<string[]> {
	const files = await globby('**/*.md', { cwd: templatesRoot })
	return files.sort()
}

const RE_FORWARD_SLASH = /\//g
const RE_MD_EXTENSION = /\.md$/
const RE_MARKDOWN_HEADING = /^#{1,6}\s/
const RE_PROPERTY_TABLE_HEADER = /^\|.*Property.*\|/
const RE_TABLE_SEPARATOR = /^\|[\s\-|]+\|$/
const RE_HTML_COMMENT = /<!--.*?-->/g
const RE_BACKTICKS = /`/g
const RE_MARKDOWN_LINK = /\[([^\]]+)\]\([^)]+\)/g

export function templatePathToDocsPath(templateRelPath: string): string {
	return `docs/${templateRelPath}`
}

export function templatePathToTaskFileName(templateRelPath: string): string {
	return templateRelPath
		.replace(RE_FORWARD_SLASH, '--')
		.replace(RE_MD_EXTENSION, '.task.json')
}

export function parseFrontmatter(content: string): DocsFrontmatter {
	const { data } = matter(content)
	return data as DocsFrontmatter
}

/** Reports frontmatter source references that no longer exist in the repository. */
export function relatedSourceIssues(relatedSources: readonly string[] | undefined): string[] {
	return (relatedSources ?? [])
		.filter(source => !existsSync(resolve(workspaceRoot, source)))
		.map(source => `relatedSources target does not exist: ${source}`)
}

export function extractHeadings(content: string): string[] {
	const lines = content.split('\n')
	const headings: string[] = []
	let inCodeBlock = false

	for (const line of lines) {
		if (line.trim()
			.startsWith('```')) {
			inCodeBlock = !inCodeBlock
		}

		if (!inCodeBlock && RE_MARKDOWN_HEADING.test(line))
			headings.push(line.trim())
	}

	return headings
}

export function extractTemplateHeadings(content: string): string[] {
	return extractHeadings(content)
		.filter(h => !h.startsWith('# '))
}

// ---------------------------------------------------------------------------
// Table property extraction
// ---------------------------------------------------------------------------

export function extractTemplateTableProperties(content: string): string[] {
	const lines = content.split('\n')
	const properties: string[] = []
	let inTable = false
	let propertyColIndex = -1

	for (const line of lines) {
		const trimmed = line.trim()

		if (!inTable && RE_PROPERTY_TABLE_HEADER.test(trimmed)) {
			const cells = trimmed.split('|')
				.map(c => c.trim())
				.filter(Boolean)
			propertyColIndex = cells.findIndex(c => c === 'Property')
			if (propertyColIndex >= 0) {
				inTable = true
				continue
			}
		}

		if (inTable && RE_TABLE_SEPARATOR.test(trimmed)) {
			continue
		}

		if (inTable && trimmed.startsWith('|')) {
			const cells = trimmed.split('|')
				.map(c => c.trim())
				.filter(Boolean)
			if (cells.length > propertyColIndex) {
				const raw = cells[propertyColIndex]
				const cleaned = raw!.replace(RE_HTML_COMMENT, '')
					.trim()
				if (cleaned && cleaned !== '...')
					properties.push(cleaned)
			}
		}
		else if (inTable && !trimmed.startsWith('|')) {
			inTable = false
			propertyColIndex = -1
		}
	}

	return properties
}

export function extractDocsTableProperties(content: string): string[] {
	const lines = content.split('\n')
	const properties: string[] = []
	let inTable = false
	let propertyColIndex = -1

	for (const line of lines) {
		const trimmed = line.trim()

		if (!inTable && RE_PROPERTY_TABLE_HEADER.test(trimmed)) {
			const cells = trimmed.split('|')
				.map(c => c.trim())
				.filter(Boolean)
			propertyColIndex = cells.findIndex(c => c === 'Property')
			if (propertyColIndex >= 0) {
				inTable = true
				continue
			}
		}

		if (inTable && RE_TABLE_SEPARATOR.test(trimmed)) {
			continue
		}

		if (inTable && trimmed.startsWith('|')) {
			const cells = trimmed.split('|')
				.map(c => c.trim())
				.filter(Boolean)
			if (cells.length > propertyColIndex) {
				const raw = cells[propertyColIndex]
				const cleaned = raw!.replace(RE_BACKTICKS, '')
					.replace(RE_MARKDOWN_LINK, '$1')
					.trim()
				if (cleaned)
					properties.push(cleaned)
			}
		}
		else if (inTable && !trimmed.startsWith('|')) {
			inTable = false
			propertyColIndex = -1
		}
	}

	return properties
}
