import type { PackageDef } from '../_skill-shared'
import { existsSync, readFileSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'pathe'
import { pageRegistry } from '../../docs/.vitepress/sidebarAndNav'
import { PACKAGES, workspaceRoot } from '../_skill-shared'

const RE_PUBLIC_SITE_LINK = /\]\((https:\/\/pikacss\.github\.io(?:\/[^)\s]*)?)(?=[\s)])/g

export function normalizePublicRoute(pathname: string): string {
	if (pathname === '' || pathname === '/')
		return '/'
	return pathname.replace(/\/+$/, '')
}

function markdownLinesOutsideFences(content: string): string[] {
	const lines: string[] = []
	let fence: '```' | '~~~' | null = null
	for (const line of content.split('\n')) {
		const trimmed = line.trimStart()
		if (fence == null && (trimmed.startsWith('```') || trimmed.startsWith('~~~'))) {
			fence = trimmed.startsWith('```') ? '```' : '~~~'
			continue
		}
		if (fence != null) {
			if (trimmed.startsWith(fence))
				fence = null
			continue
		}
		lines.push(line)
	}
	return lines
}

function firstMarkdownH1(content: string): string | undefined {
	return markdownLinesOutsideFences(content)
		.find(line => line.startsWith('# '))
		?.slice(2)
		.trim()
}

function publicSiteLinks(content: string): string[] {
	const markdown = markdownLinesOutsideFences(content)
		.join('\n')
	return [...markdown.matchAll(RE_PUBLIC_SITE_LINK)]
		.map(match => match[1]!)
}

export function readmeIssues(pkg: PackageDef, content: string, validRoutes: ReadonlySet<string>): string[] {
	const issues: string[] = []
	const title = firstMarkdownH1(content)
	if (title !== pkg.name)
		issues.push(`README H1 must be '${pkg.name}' (found '${title ?? 'missing'}')`)

	const links = publicSiteLinks(content)
	if (links.length === 0) {
		issues.push('README must link to at least one public PikaCSS site page')
		return issues
	}

	const normalizedRoutes = new Set([...validRoutes].map(normalizePublicRoute))
	for (const link of links) {
		const route = normalizePublicRoute(new URL(link).pathname)
		if (!normalizedRoutes.has(route))
			issues.push(`README PikaCSS site link points to an unsupported route: ${link}`)
	}

	return issues
}

function main(): void {
	const validRoutes = new Set([
		'/',
		'/playground',
		...pageRegistry.map(page => normalizePublicRoute(page.path)),
	])
	const failures: string[] = []

	for (const pkg of PACKAGES) {
		const readmePath = resolve(workspaceRoot, 'packages', pkg.dir, 'README.md')
		if (!existsSync(readmePath)) {
			failures.push(`packages/${pkg.dir}/README.md: missing package README`)
			continue
		}

		for (const issue of readmeIssues(pkg, readFileSync(readmePath, 'utf8'), validRoutes))
			failures.push(`packages/${pkg.dir}/README.md: ${issue}`)
	}

	if (failures.length > 0) {
		console.error(`Package README check failed (${failures.length} issue(s)):`)
		for (const failure of failures)
			console.error(`  - ${failure}`)
		process.exitCode = 1
		return
	}

	console.log(`Package README check OK (${PACKAGES.length} packages).`)
}

if (process.argv[1] != null && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url)))
	main()
