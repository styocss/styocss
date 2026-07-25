import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { globby } from 'globby'
import { join } from 'pathe'
import {
	normalizePackageScope,
	PACKAGES,
	readMultiValueOption,
	workspaceRoot,
} from '../_skill-shared'

const EXCLUDED_PATTERNS = ['.test.ts', '.spec.ts', 'pika.gen.', 'generated-', '/dist/', '/coverage/', '/node_modules/']
const RE_BACKTICK_CODE_SPAN = /`[^`]*`/g
const RE_LITERAL_ESCAPES = /\\n|\\t|\\r/
const RE_UNFILLED_TODO = /@todo\s+FILL/i
const TAG_PATTERN = /@(?:param|returns|remarks|example|default|typeParam|internal|throws|see|since|deprecated)\b/g

interface LintIssue {
	file: string
	line: number
	rule: string
	message: string
	excerpt: string
}

/**
 * Detects literal escape sequences (\n, \t, \r) inside JSDoc comment lines
 * that should be actual newlines/tabs but were incorrectly serialized by
 * the LLM during the fill step.
 *
 * Skips lines that are inside fenced code blocks (```), since those may
 * legitimately contain escape sequences in string literals.
 */
function checkLiteralEscapes(lines: string[], filePath: string): LintIssue[] {
	const issues: LintIssue[] = []
	let inJSDoc = false
	let inCodeFence = false

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!
		const stripped = line.trim()

		if (stripped.startsWith('/**')) {
			inJSDoc = true
			inCodeFence = false
		}

		if (inJSDoc) {
			if (stripped === '* ```ts' || stripped === '* ```typescript' || stripped === '* ```js' || stripped === '* ```') {
				inCodeFence = !inCodeFence
			}

			if (!inCodeFence) {
				// Look for literal \n, \t, \r that are NOT inside backtick-quoted code spans
				// Remove backtick code spans first to avoid false positives
				const withoutCodeSpans = line.replace(RE_BACKTICK_CODE_SPAN, '')
				if (RE_LITERAL_ESCAPES.test(withoutCodeSpans) && stripped.startsWith('*')) {
					issues.push({
						file: filePath,
						line: i + 1,
						rule: 'no-literal-escapes',
						message: 'Literal escape sequence (\\n, \\t, or \\r) found in JSDoc. Should be actual newlines.',
						excerpt: line.trimEnd()
							.slice(0, 120),
					})
				}
			}
		}

		if (inJSDoc && stripped.endsWith('*/')) {
			inJSDoc = false
			inCodeFence = false
		}
	}

	return issues
}

/**
 * Detects leftover @todo FILL markers that were not replaced during the
 * fill step.
 */
function checkUnfilledTodos(lines: string[], filePath: string): LintIssue[] {
	const issues: LintIssue[] = []
	let inJSDoc = false

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!
		const stripped = line.trim()

		if (stripped.startsWith('/**'))
			inJSDoc = true

		if (inJSDoc && RE_UNFILLED_TODO.test(line)) {
			issues.push({
				file: filePath,
				line: i + 1,
				rule: 'no-unfilled-todo',
				message: 'Unfilled @todo FILL marker remaining in JSDoc.',
				excerpt: line.trimEnd()
					.slice(0, 120),
			})
		}

		if (inJSDoc && stripped.endsWith('*/'))
			inJSDoc = false
	}

	return issues
}

/**
 * Detects JSDoc blocks with multiple @-tags on the same line, which
 * indicates incorrectly merged tag sections.
 */
function checkMultipleTagsOnOneLine(lines: string[], filePath: string): LintIssue[] {
	const issues: LintIssue[] = []
	let inJSDoc = false
	let inCodeFence = false

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!
		const stripped = line.trim()

		if (stripped.startsWith('/**')) {
			inJSDoc = true
			inCodeFence = false
		}

		if (inJSDoc) {
			if (stripped === '* ```ts' || stripped === '* ```typescript' || stripped === '* ```js' || stripped === '* ```') {
				inCodeFence = !inCodeFence
			}

			if (!inCodeFence && stripped.startsWith('*')) {
				// Remove backtick code spans to avoid false positives
				const withoutCodeSpans = line.replace(RE_BACKTICK_CODE_SPAN, '')
				const matches = [...withoutCodeSpans.matchAll(TAG_PATTERN)]
				if (matches.length > 1) {
					issues.push({
						file: filePath,
						line: i + 1,
						rule: 'no-merged-tags',
						message: `Multiple JSDoc tags on one line (${matches.map(m => m[0])
							.join(', ')}). Each tag should start on its own line.`,
						excerpt: line.trimEnd()
							.slice(0, 120),
					})
				}
			}
		}

		if (inJSDoc && stripped.endsWith('*/')) {
			inJSDoc = false
			inCodeFence = false
		}
	}

	return issues
}

// ── Main ──

const ALL_CHECKS = [
	checkLiteralEscapes,
	checkUnfilledTodos,
	checkMultipleTagsOnOneLine,
]

export async function runLint(args = process.argv.slice(2)) {
	if (args.includes('--help')) {
		console.log([
			'Usage: pnpm maintain-jsdocs:lint [--packages <name> ...]',
			'',
			'Lint JSDoc comments for common LLM fill-step corruption patterns.',
			'',
			'Options:',
			'  --packages <name> ...  Packages to lint (default: all packages)',
			'',
			'Rules:',
			'  no-literal-escapes   Literal \\n/\\t/\\r in JSDoc (should be real newlines)',
			'  no-unfilled-todo     Leftover @todo FILL markers',
			'  no-merged-tags       Multiple @-tags on a single line',
			'',
			'Examples:',
			'  pnpm maintain-jsdocs:lint',
			'  pnpm maintain-jsdocs:lint --packages core integration',
		].join('\n'))
		return
	}

	const requestedPackages = readMultiValueOption(args, '--packages')
		.map(normalizePackageScope)

	const targetPackages = requestedPackages.length > 0
		? PACKAGES.filter(pkg => requestedPackages.includes(pkg.dir))
		: PACKAGES

	if (targetPackages.length === 0) {
		console.error('No matching packages found.')
		process.exit(1)
	}

	const allIssues: LintIssue[] = []

	for (const pkg of targetPackages) {
		const srcDir = join(workspaceRoot, 'packages', pkg.dir, 'src')
		const files = await globby('**/*.ts', { cwd: srcDir, absolute: true })

		for (const filePath of files) {
			if (EXCLUDED_PATTERNS.some(p => filePath.includes(p)))
				continue

			const content = await readFile(filePath, 'utf8')
			const lines = content.split('\n')

			for (const check of ALL_CHECKS) {
				allIssues.push(...check(lines, filePath))
			}
		}
	}

	// ── Report ──

	if (allIssues.length === 0) {
		console.log('✅ No JSDoc lint issues detected.')
		return
	}

	console.log(`\n❌ Found ${allIssues.length} JSDoc lint issue(s):\n`)

	const byFile = new Map<string, LintIssue[]>()
	for (const issue of allIssues) {
		const rel = issue.file.startsWith(`${workspaceRoot}/`)
			? issue.file.slice(workspaceRoot.length + 1)
			: issue.file
		if (!byFile.has(rel))
			byFile.set(rel, [])
		byFile.get(rel)!.push(issue)
	}

	for (const [file, issues] of byFile) {
		console.log(`${file}:`)
		for (const issue of issues) {
			console.log(`  L${issue.line} [${issue.rule}] ${issue.message}`)
			console.log(`    ${issue.excerpt}`)
		}
		console.log()
	}

	process.exit(1)
}

runLint()
