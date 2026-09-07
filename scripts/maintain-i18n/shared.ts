import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { globby } from 'globby'
import matter from 'gray-matter'
import { relative, resolve } from 'pathe'
import { workspaceRoot } from '../_skill-shared'

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

export { workspaceRoot }
export const docsRoot = resolve(workspaceRoot, 'docs')
export const zhLocaleDir = 'zh-tw'
export const zhRoot = resolve(docsRoot, zhLocaleDir)
export const skillRoot = resolve(workspaceRoot, '.claude/skills/maintain-i18n')
export const tasksOutputRoot = resolve(workspaceRoot, '.maintain-i18n/tasks')
export const forbiddenTermsPath = resolve(workspaceRoot, 'scripts/maintain-i18n/forbidden-terms.json')

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export type PageState = 'missing' | 'fresh' | 'stale' | 'untracked' | 'orphaned'
export type FallbackVerdict = 'incremental' | 'full-retranslate' | 'move' | 'delete'

export interface TranslationBlock {
	sourceFile: string
	sourceCommit?: string
	sourceBlob: string
}

export interface TaskFile {
	state: PageState
	freshness: number | null
	sourceFile: string
	zhFile: string
	diff: string
	fallbackVerdict: FallbackVerdict
	renameTarget?: string
}

// ---------------------------------------------------------------------------
// Inventory — translatable English pages (§3.4 step 1)
//   docs/**/*.md  minus docs/zh-tw/**  minus generated docs/api/* (keep api/index.md)  minus .vitepress/
// ---------------------------------------------------------------------------

export async function discoverEnglishPages(): Promise<string[]> {
	const files = await globby('**/*.md', {
		cwd: docsRoot,
		ignore: [
			'node_modules/**',
			`${zhLocaleDir}/**`,
			'.vitepress/**',
			'.examples/**',
		],
	})
	const kept = files.filter((rel) => {
		// Generated API pages are English-only; keep only the hand-authored api/index.md.
		if (rel.startsWith('api/') && rel !== 'api/index.md')
			return false
		return true
	})
	return kept.sort()
}

/** English page docs-relative path (e.g. `getting-started/setup.md`) -> zh docs-relative path. */
export function englishToZhRel(rel: string): string {
	return `${zhLocaleDir}/${rel}`
}

export function pageSlug(rel: string): string {
	return rel.replace(/\.md$/, '')
		.replace(/\//g, '--')
}

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

export function parseTranslationBlock(content: string): TranslationBlock | null {
	const { data } = matter(content)
	const block = (data as Record<string, unknown>).translation
	if (block == null || typeof block !== 'object')
		return null
	const b = block as Record<string, unknown>
	if (typeof b.sourceFile !== 'string' || typeof b.sourceBlob !== 'string')
		return null
	const sourceCommit = typeof b.sourceCommit === 'string' && b.sourceCommit.length > 0
		? b.sourceCommit
		: undefined
	return {
		sourceFile: b.sourceFile,
		...(sourceCommit ? { sourceCommit } : {}),
		sourceBlob: b.sourceBlob,
	}
}

export function writeTranslationBlock(content: string, block: TranslationBlock): string {
	const parsed = matter(content)
	const translation = {
		sourceFile: block.sourceFile,
		...(block.sourceCommit ? { sourceCommit: block.sourceCommit } : {}),
		sourceBlob: block.sourceBlob,
	}
	const data = { ...parsed.data, translation }
	// gray-matter's stringify re-emits the frontmatter; body is preserved verbatim.
	return matter.stringify(parsed.content, data)
}

// ---------------------------------------------------------------------------
// git helpers
// ---------------------------------------------------------------------------

function git(args: string[], opts: { allowDifferenceExit?: boolean } = {}): string {
	try {
		return execFileSync('git', args, { cwd: workspaceRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
	}
	catch (error) {
		const status = typeof error === 'object' && error != null && 'status' in error
			? (error as { status?: number }).status
			: undefined
		const stdout = typeof error === 'object' && error != null && 'stdout' in error
			? (error as { stdout?: string | Buffer }).stdout
			: undefined
		const stdoutText = typeof stdout === 'string'
			? stdout
			: Buffer.isBuffer(stdout) ? stdout.toString('utf8') : ''
		// `git diff --no-index` uses exit 1 for a real difference, but Git may
		// still emit non-fatal warnings (for example autocrlf warnings on Windows).
		// Genuine failures such as an inaccessible input also exit 1 but produce no diff.
		if (opts.allowDifferenceExit && status === 1 && stdoutText.length > 0)
			return stdoutText
		throw error
	}
}

/** Git blob hash of the working-tree content of a docs-relative file. */
export function hashObject(docsRelPath: string): string {
	return git(['hash-object', resolve(docsRoot, docsRelPath)])
		.trim()
}

/** Blob currently staged for a docs-relative file; null when the path has no index entry. */
export function stagedBlob(docsRelPath: string): string | null {
	const repoRel = relative(workspaceRoot, resolve(docsRoot, docsRelPath))
	try {
		return git(['rev-parse', `:${repoRel}`])
			.trim()
	}
	catch {
		return null
	}
}

export function headCommit(): string {
	return git(['rev-parse', 'HEAD'])
		.trim()
}

/** True if the file differs from its committed (HEAD) content or is untracked. */
export function isSourceDirty(docsRelPath: string): boolean {
	const repoRel = relative(workspaceRoot, resolve(docsRoot, docsRelPath))
	const out = git(['status', '--porcelain', '--', repoRel])
	return out.trim().length > 0
}

/** Retrieve committed blob content by sha; null if the object is missing. */
export function catBlob(sha: string): string | null {
	if (!sha)
		return null
	try {
		return execFileSync('git', ['cat-file', 'blob', sha], { cwd: workspaceRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
	}
	catch {
		return null
	}
}

export interface NumStat {
	added: number
	deleted: number
}

/** Line-level added/deleted between an old content string and the current file. */
export function numstatAgainst(oldContent: string, currentDocsRel: string): NumStat {
	const dir = mkdtempSync(resolve(tmpdir(), 'maintain-i18n-'))
	const oldPath = resolve(dir, 'old')
	writeFileSync(oldPath, oldContent, 'utf8')
	// git diff --no-index exits 1 when files differ; that specific non-error exit is expected.
	const out = git(['diff', '--no-index', '--numstat', oldPath, resolve(docsRoot, currentDocsRel)], { allowDifferenceExit: true })
	const line = out.trim()
		.split('\n')
		.find(l => /^\d+\t\d+\t/.test(l) || /^-\t-\t/.test(l))
	if (!line)
		return { added: 0, deleted: 0 }
	const [a, d] = line.split('\t')
	return {
		added: a === '-' ? 0 : Number.parseInt(a ?? '0', 10),
		deleted: d === '-' ? 0 : Number.parseInt(d ?? '0', 10),
	}
}

/** Full textual diff between old content and the current file (embedded in task files). */
export function diffAgainst(oldContent: string, currentDocsRel: string): string {
	const dir = mkdtempSync(resolve(tmpdir(), 'maintain-i18n-'))
	const oldPath = resolve(dir, 'old')
	writeFileSync(oldPath, oldContent, 'utf8')
	return git(['diff', '--no-index', oldPath, resolve(docsRoot, currentDocsRel)], { allowDifferenceExit: true })
}

// ---------------------------------------------------------------------------
// Line counting
// ---------------------------------------------------------------------------

export function countLines(docsRelPath: string): number {
	const abs = resolve(docsRoot, docsRelPath)
	if (!existsSync(abs))
		return 0
	const content = readFileSync(abs, 'utf8')
	if (content.length === 0)
		return 0
	return content.split('\n').length
}

// ---------------------------------------------------------------------------
// Markdown structure: headings and anchors
// ---------------------------------------------------------------------------

// `(\s.*)` (single leading ws, then rest) instead of `\s+(.*)` avoids the
// overlapping-quantifier backtracking warning; text is trimmed by the caller.
const RE_HEADING = /^(#{1,6})(\s.*)$/
const RE_EXPLICIT_ID = /\{#([^}]+)\}\s*$/

export interface Heading {
	level: number
	/** raw heading text with the trailing {#id} stripped */
	text: string
	/** explicit id from `{#id}` if present */
	explicitId: string | null
}

/** Extract headings, skipping fenced code blocks (mirrors maintain-docs extractHeadings). */
export function extractHeadings(content: string): Heading[] {
	const lines = matter(content).content.split('\n')
	const headings: Heading[] = []
	let inFence = false
	for (const raw of lines) {
		const line = raw.trimEnd()
		if (line.trim()
			.startsWith('```')) {
			inFence = !inFence
			continue
		}
		if (inFence)
			continue
		const m = RE_HEADING.exec(line)
		if (!m)
			continue
		const level = m[1]!.length
		let text = m[2]!.trim()
		let explicitId: string | null = null
		const idMatch = RE_EXPLICIT_ID.exec(text)
		if (idMatch) {
			explicitId = idMatch[1]!.trim()
			text = text.replace(RE_EXPLICIT_ID, '')
				.trim()
		}
		headings.push({ level, text, explicitId })
	}
	return headings
}

// VitePress / @mdit-vue slugify, replicated verbatim from
// vitepress/dist/node (src/slugify.ts) so anchor ids match the built site.
// eslint-disable-next-line no-control-regex -- slugify strips C0 control chars, exactly as VitePress does
const rControl = /[\u0000-\u001F]/g
const rSpecial = /[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'\u201C\u201D\u2018\u2019<>,.?/]+/g
const rCombining = /[\u0300-\u036F]/g

export function slugify(str: string): string {
	return str
		.normalize('NFKD')
		.replace(rCombining, '')
		.replace(rControl, '')
		.replace(rSpecial, '-')
		.replace(/-{2,}/g, '-')
		.replace(/^-+|-+$/g, '')
		.replace(/^(\d)/, '_$1')
		.toLowerCase()
}

/** The ordered anchor-id sequence a VitePress page produces (with duplicate-suffix dedup). */
export function anchorSequence(headings: Heading[]): string[] {
	const seen = new Map<string, number>()
	const ids: string[] = []
	for (const h of headings) {
		const base = h.explicitId ?? slugify(h.text)
		const count = seen.get(base) ?? 0
		seen.set(base, count + 1)
		ids.push(count === 0 ? base : `${base}-${count}`)
	}
	return ids
}

/** For zh pages: the ordered explicit `{#id}` sequence (missing ids surface as empty strings). */
export function explicitAnchorSequence(headings: Heading[]): (string | null)[] {
	return headings.map(h => h.explicitId)
}

// ---------------------------------------------------------------------------
// Longest-common-subsequence ratio over two string sequences
// ---------------------------------------------------------------------------

export function lcsRatio(a: string[], b: string[]): number {
	if (a.length === 0 && b.length === 0)
		return 1
	const n = a.length
	const m = b.length
	const dp: number[][] = Array.from({ length: n + 1 }, () => Array.from<number>({ length: m + 1 })
		.fill(0))
	for (let i = 1; i <= n; i++) {
		for (let j = 1; j <= m; j++) {
			dp[i]![j] = a[i - 1] === b[j - 1]
				? dp[i - 1]![j - 1]! + 1
				: Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!)
		}
	}
	const lcs = dp[n]![m]!
	return lcs / Math.max(n, m)
}

// ---------------------------------------------------------------------------
// TypeScript comment stripping (fixture comment-only invariant, §3.6)
// ---------------------------------------------------------------------------

/**
 * Remove line and block comments from TS/JS source so two files can be compared
 * "modulo comments". String and template literals are preserved so that comment
 * markers inside strings do not corrupt the result.
 */
export function stripTsComments(src: string): string {
	let out = ''
	let i = 0
	const n = src.length
	type Mode = 'code' | 'line' | 'block' | 'single' | 'double' | 'template'
	let mode: Mode = 'code'
	while (i < n) {
		const c = src[i]!
		const next = i + 1 < n ? src[i + 1]! : ''
		if (mode === 'code') {
			if (c === '/' && next === '/') {
				mode = 'line'
				i += 2
				continue
			}
			if (c === '/' && next === '*') {
				mode = 'block'
				i += 2
				continue
			}
			if (c === '\'') {
				mode = 'single'
			}
			else if (c === '"') {
				mode = 'double'
			}
			else if (c === '`') {
				mode = 'template'
			}
			out += c
			i += 1
			continue
		}
		if (mode === 'line') {
			if (c === '\n') {
				mode = 'code'
				out += c
			}
			i += 1
			continue
		}
		if (mode === 'block') {
			if (c === '*' && next === '/') {
				mode = 'code'
				i += 2
				continue
			}
			// keep newlines so line counts stay stable
			if (c === '\n')
				out += c
			i += 1
			continue
		}
		// string / template literal: copy verbatim, honour escapes
		out += c
		if (c === '\\' && i + 1 < n) {
			out += src[i + 1]!
			i += 2
			continue
		}
		if ((mode === 'single' && c === '\'')
			|| (mode === 'double' && c === '"')
			|| (mode === 'template' && c === '`')) {
			mode = 'code'
		}
		i += 1
	}
	return out
}

/** Collapse whitespace so comment removal (which leaves gaps) yields a stable comparison key. */
export function normalizeForCompare(src: string): string {
	return src.replace(/\s+/g, ' ')
		.trim()
}

// ---------------------------------------------------------------------------
// Fixture completeness and comment-only invariant (§3.6)
// ---------------------------------------------------------------------------

export interface FixtureViolation {
	zhFile: string
	sourceFile: string
	reason: string
}

const FIXTURE_GLOB = '.examples/**/*.{ts,css}'

/** All English fixture files (docs-relative) under docs/.examples. */
export async function discoverEnglishFixtures(): Promise<string[]> {
	const files = await globby(FIXTURE_GLOB, { cwd: docsRoot })
	return files.sort()
}

/** All zh fixture files (docs-relative) under docs/zh-tw/.examples. */
export async function discoverZhFixtures(): Promise<string[]> {
	const files = await globby(`${zhLocaleDir}/${FIXTURE_GLOB}`, { cwd: docsRoot })
	return files.sort()
}

export function zhFixtureToEnglishRel(zhRel: string): string {
	return zhRel.replace(new RegExp(`^${zhLocaleDir}/`), '')
}

export function englishFixtureToZhRel(sourceRel: string): string {
	return `${zhLocaleDir}/${sourceRel}`
}

/** Check that every English fixture has one zh mirror and vice versa. */
export function checkFixtureCompleteness(englishRels: string[], zhRels: string[]): FixtureViolation[] {
	const englishSet = new Set(englishRels)
	const zhSet = new Set(zhRels)
	const violations: FixtureViolation[] = []

	for (const sourceRel of [...englishRels].sort()) {
		const zhRel = englishFixtureToZhRel(sourceRel)
		if (!zhSet.has(zhRel)) {
			violations.push({
				zhFile: `docs/${zhRel}`,
				sourceFile: `docs/${sourceRel}`,
				reason: 'zh-TW fixture counterpart does not exist (missing mirror)',
			})
		}
	}

	for (const zhRel of [...zhRels].sort()) {
		const sourceRel = zhFixtureToEnglishRel(zhRel)
		if (!englishSet.has(sourceRel)) {
			violations.push({
				zhFile: `docs/${zhRel}`,
				sourceFile: `docs/${sourceRel}`,
				reason: 'English fixture counterpart does not exist (orphaned copy)',
			})
		}
	}

	return violations
}

/** Compare fixture contents under the comment-only/byte-identical policy. */
export function checkFixtureContents(
	zhRel: string,
	sourceRel: string,
	zhContent: string,
	sourceContent: string,
): FixtureViolation | null {
	if (zhRel.endsWith('.ts')) {
		const zhKey = normalizeForCompare(stripTsComments(zhContent))
		const srcKey = normalizeForCompare(stripTsComments(sourceContent))
		if (zhKey !== srcKey)
			return { zhFile: `docs/${zhRel}`, sourceFile: `docs/${sourceRel}`, reason: 'code differs after stripping comments (only comments may be translated)' }
		return null
	}

	if (zhContent !== sourceContent)
		return { zhFile: `docs/${zhRel}`, sourceFile: `docs/${sourceRel}`, reason: 'file is not byte-identical to the English counterpart' }
	return null
}

/**
 * Compare one zh fixture against its English counterpart.
 *  - `.ts`: equal after comment stripping + whitespace normalization (comments-only diff allowed)
 *  - other (`.css`): byte-identical
 * Returns null when the pair conforms.
 */
export function checkFixture(zhRel: string): FixtureViolation | null {
	const sourceRel = zhFixtureToEnglishRel(zhRel)
	const zhAbs = resolve(docsRoot, zhRel)
	const srcAbs = resolve(docsRoot, sourceRel)
	if (!existsSync(srcAbs))
		return { zhFile: `docs/${zhRel}`, sourceFile: `docs/${sourceRel}`, reason: 'English fixture counterpart does not exist (orphaned copy)' }

	const zhContent = readFileSync(zhAbs, 'utf8')
	const srcContent = readFileSync(srcAbs, 'utf8')
	return checkFixtureContents(zhRel, sourceRel, zhContent, srcContent)
}

export async function checkAllFixtures(): Promise<FixtureViolation[]> {
	const [englishFixtures, zhFixtures] = await Promise.all([
		discoverEnglishFixtures(),
		discoverZhFixtures(),
	])
	const violations = checkFixtureCompleteness(englishFixtures, zhFixtures)
	const englishSet = new Set(englishFixtures)
	for (const rel of zhFixtures) {
		const sourceRel = zhFixtureToEnglishRel(rel)
		if (!englishSet.has(sourceRel))
			continue
		const v = checkFixture(rel)
		if (v)
			violations.push(v)
	}
	return violations
}
