import type { FallbackVerdict, PageState, TaskFile } from './shared'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { resolve } from 'pathe'
import {
	anchorSequence,
	catBlob,
	checkAllFixtures,
	countLines,
	diffAgainst,
	discoverEnglishPages,
	docsRoot,
	englishToZhRel,
	extractHeadings,
	hashObject,
	headCommit,
	isSourceDirty,
	lcsRatio,

	numstatAgainst,
	pageSlug,
	parseTranslationBlock,
	stagedBlob,
	tasksOutputRoot,
	writeTranslationBlock,
	zhLocaleDir,
} from './shared'

// ---------------------------------------------------------------------------
// Tunable policy constants (§3.5)
// ---------------------------------------------------------------------------

/** Full-page retranslation when > 60% of the current page differs from source. */
const FULL_RETRANSLATE_RATIO = 0.6
/** Full-page retranslation when heading-slug LCS drops below this (section reordering). */
const HEADING_LCS_MIN = 0.7
/** Stale pages below this drift may be deferred (typo/reflow noise). */
const DRIFT_DEFER_THRESHOLD = 0.05
/** Trigger a sync pass once this many pages are stale. */
const STALE_COUNT_TRIGGER = 3

// ---------------------------------------------------------------------------
// Per-page result
// ---------------------------------------------------------------------------

interface PageResult {
	sourceFile: string
	zhFile: string
	englishRel: string
	zhRel: string
	state: PageState
	/** null = not applicable (untracked / orphaned) */
	freshness: number | null
	sourceLines: number
	verdict: FallbackVerdict
	diff: string
}

function analyzeEnglishPage(englishRel: string): PageResult {
	const zhRel = englishToZhRel(englishRel)
	const zhAbs = resolve(docsRoot, zhRel)
	const sourceLines = countLines(englishRel)
	const base = {
		sourceFile: `docs/${englishRel}`,
		zhFile: `docs/${zhRel}`,
		englishRel,
		zhRel,
		sourceLines,
	}

	if (!existsSync(zhAbs)) {
		return { ...base, state: 'missing', freshness: 0, verdict: 'full-retranslate', diff: '' }
	}

	const zhContent = readFileSync(zhAbs, 'utf8')
	const block = parseTranslationBlock(zhContent)
	if (!block) {
		return { ...base, state: 'untracked', freshness: null, verdict: 'full-retranslate', diff: '' }
	}

	const currentBlob = hashObject(englishRel)
	if (currentBlob === block.sourceBlob) {
		return { ...base, state: 'fresh', freshness: 100, verdict: 'incremental', diff: '' }
	}

	// stale: recover the translated-from English content
	let oldContent = catBlob(block.sourceBlob)
	if (oldContent == null && block.sourceCommit)
		oldContent = catBlob(`${block.sourceCommit}:${block.sourceFile}`)

	if (oldContent == null) {
		// No reliable diff base — force full retranslation (§3.5 trigger 4).
		return { ...base, state: 'stale', freshness: 0, verdict: 'full-retranslate', diff: '' }
	}

	const { added, deleted } = numstatAgainst(oldContent, englishRel)
	const ratio = sourceLines > 0 ? (added + deleted) / sourceLines : 1
	const freshness = Math.max(0, 1 - ratio) * 100

	const currentEnglish = readFileSync(resolve(docsRoot, englishRel), 'utf8')
	const oldAnchors = anchorSequence(extractHeadings(oldContent))
	const newAnchors = anchorSequence(extractHeadings(currentEnglish))
	const headingLcs = lcsRatio(oldAnchors, newAnchors)

	const verdict: FallbackVerdict
		= ratio > FULL_RETRANSLATE_RATIO || headingLcs < HEADING_LCS_MIN
			? 'full-retranslate'
			: 'incremental'

	return {
		...base,
		state: 'stale',
		freshness,
		verdict,
		diff: diffAgainst(oldContent, englishRel),
	}
}

async function writeTaskFile(result: PageResult): Promise<void> {
	const task: TaskFile = {
		state: result.state,
		freshness: result.freshness,
		sourceFile: result.sourceFile,
		zhFile: result.zhFile,
		diff: result.diff,
		fallbackVerdict: result.verdict,
	}
	const taskPath = resolve(tasksOutputRoot, `${pageSlug(result.englishRel)}.json`)
	await writeFile(taskPath, `${JSON.stringify(task, null, '\t')}\n`, 'utf8')
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

interface Report {
	pages: PageResult[]
	fixtureViolations: { zhFile: string, sourceFile: string, reason: string }[]
	siteFreshness: number
	counts: Record<PageState, number>
	syncRecommended: boolean
}

function computeReport(pages: PageResult[], fixtureViolations: Report['fixtureViolations']): Report {
	const counts: Record<PageState, number> = { missing: 0, fresh: 0, stale: 0, untracked: 0, orphaned: 0 }
	let weighted = 0
	let totalLines = 0
	for (const p of pages) {
		counts[p.state]++
		// Line-weighted site freshness over pages with a numeric freshness
		// (untracked/orphaned are reported separately, §3.3).
		if (p.freshness != null) {
			weighted += p.freshness * p.sourceLines
			totalLines += p.sourceLines
		}
	}
	const siteFreshness = totalLines > 0 ? weighted / totalLines : 0

	const staleWithDrift = pages.filter(p => p.state === 'stale' && (p.freshness ?? 100) <= (1 - DRIFT_DEFER_THRESHOLD) * 100)
	const syncRecommended = counts.missing > 0 || counts.orphaned > 0 || staleWithDrift.length >= STALE_COUNT_TRIGGER || staleWithDrift.length > 0

	return { pages, fixtureViolations, siteFreshness, counts, syncRecommended }
}

function printHuman(report: Report): void {
	const { counts, siteFreshness, pages } = report
	console.log('\n=== zh-TW Translation Status ===\n')
	console.log(`Total English pages: ${pages.length}`)
	console.log(`  fresh:      ${counts.fresh}`)
	console.log(`  stale:      ${counts.stale}`)
	console.log(`  missing:    ${counts.missing}`)
	console.log(`  untracked:  ${counts.untracked}`)
	console.log(`  orphaned:   ${counts.orphaned}`)
	console.log('')
	console.log(`Site freshness (line-weighted): ${siteFreshness.toFixed(1)}%`)
	console.log('  Note: line-ratio freshness is a drift-magnitude proxy for prioritization,')
	console.log('  not a semantic-staleness claim. Correctness is binary (fresh or not).')
	console.log('')

	const list = (state: PageState, label: string) => {
		const items = pages.filter(p => p.state === state)
		if (items.length === 0)
			return
		console.log(`${label}:`)
		for (const p of items) {
			const fresh = p.freshness == null ? 'n/a' : `${p.freshness.toFixed(0)}%`
			const verdict = state === 'stale' ? ` [${p.verdict}]` : ''
			console.log(`  - ${p.zhFile}  (${fresh})${verdict}`)
		}
		console.log('')
	}

	list('missing', 'Missing pages')
	list('stale', 'Stale pages')
	list('untracked', 'Untracked pages (need adoption via --mark-synced)')
	list('orphaned', 'Orphaned pages (English source gone)')

	if (report.fixtureViolations.length > 0) {
		console.log('Fixture violations:')
		for (const v of report.fixtureViolations)
			console.log(`  - ${v.zhFile}: ${v.reason}`)
		console.log('')
	}

	console.log(report.syncRecommended
		? 'Sync pass recommended.'
		: 'No sync pass needed.')
	console.log(`Task files written to: .maintain-i18n/tasks/`)
}

// ---------------------------------------------------------------------------
// Orphan detection — zh pages whose recorded source no longer exists
// ---------------------------------------------------------------------------

async function detectOrphans(englishRels: Set<string>): Promise<PageResult[]> {
	const { globby } = await import('globby')
	const zhPages = await globby(`${zhLocaleDir}/**/*.md`, {
		cwd: docsRoot,
		ignore: [`${zhLocaleDir}/.examples/**`],
	})
	const orphans: PageResult[] = []
	for (const zhRel of zhPages.sort()) {
		// derive the English counterpart
		const englishRel = zhRel.replace(new RegExp(`^${zhLocaleDir}/`), '')
		if (englishRels.has(englishRel))
			continue // handled by the English-page pass
		const zhAbs = resolve(docsRoot, zhRel)
		const block = parseTranslationBlock(readFileSync(zhAbs, 'utf8'))
		const sourceFile = block?.sourceFile ?? `docs/${englishRel}`
		orphans.push({
			sourceFile,
			zhFile: `docs/${zhRel}`,
			englishRel,
			zhRel,
			state: 'orphaned',
			freshness: 0,
			sourceLines: 0,
			verdict: 'delete',
			diff: '',
		})
	}
	return orphans
}

// ---------------------------------------------------------------------------
// --mark-synced
// ---------------------------------------------------------------------------

async function markSynced(zhArgs: string[]): Promise<number> {
	if (zhArgs.length === 0) {
		console.error('--mark-synced requires at least one zh page path (e.g. docs/zh-tw/index.md)')
		return 1
	}
	const commit = headCommit()
	let failures = 0

	for (const arg of zhArgs) {
		// normalize to a docs-relative zh path
		let zhRel = arg.replace(/^\.\//, '')
		zhRel = zhRel.replace(/^docs\//, '')
		if (!zhRel.startsWith(`${zhLocaleDir}/`)) {
			console.error(`Not a zh-tw page: ${arg}`)
			failures++
			continue
		}
		const zhAbs = resolve(docsRoot, zhRel)
		if (!existsSync(zhAbs)) {
			console.error(`zh page does not exist: ${arg}`)
			failures++
			continue
		}
		const englishRel = zhRel.replace(new RegExp(`^${zhLocaleDir}/`), '')
		const englishAbs = resolve(docsRoot, englishRel)
		if (!existsSync(englishAbs)) {
			console.error(`English source does not exist for ${arg}: docs/${englishRel}`)
			failures++
			continue
		}
		const sourceDirty = isSourceDirty(englishRel)
		const workingBlob = hashObject(englishRel)
		let sourceBlob = workingBlob
		if (sourceDirty) {
			const indexBlob = stagedBlob(englishRel)
			if (indexBlob == null || indexBlob !== workingBlob) {
				console.error(`Refusing to mark-synced: stage the current English source first: docs/${englishRel}`)
				console.error('  Same-commit provenance must point at the exact blob already present in the Git index; unstaged-only content could become a dangling blob that clones cannot retrieve.')
				failures++
				continue
			}
			sourceBlob = indexBlob
		}

		const zhContent = readFileSync(zhAbs, 'utf8')
		const updated = writeTranslationBlock(zhContent, {
			sourceFile: `docs/${englishRel}`,
			...(sourceDirty ? {} : { sourceCommit: commit }),
			sourceBlob,
		})
		await writeFile(zhAbs, updated, 'utf8')
		const sourceLabel = sourceDirty
			? `staged blob ${sourceBlob.slice(0, 8)} for the same commit`
			: `blob ${sourceBlob.slice(0, 8)} @ ${commit.slice(0, 8)}`
		console.log(`marked synced: docs/${zhRel}  (${sourceLabel})`)
	}

	return failures > 0 ? 1 : 0
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	const argv = process.argv.slice(2)
	const markSyncedIdx = argv.indexOf('--mark-synced')
	if (markSyncedIdx !== -1) {
		const targets = argv.slice(markSyncedIdx + 1)
			.filter(a => !a.startsWith('--'))
		const code = await markSynced(targets)
		process.exit(code)
	}

	const asJson = argv.includes('--json')
	const strict = argv.includes('--strict')

	const englishRels = await discoverEnglishPages()
	const englishSet = new Set(englishRels)

	await mkdir(tasksOutputRoot, { recursive: true })

	const pages: PageResult[] = []
	for (const rel of englishRels) {
		const result = analyzeEnglishPage(rel)
		pages.push(result)
		if (result.state !== 'fresh')
			await writeTaskFile(result)
	}

	const orphans = await detectOrphans(englishSet)
	for (const o of orphans) {
		pages.push(o)
		await writeTaskFile(o)
	}

	const fixtureViolations = await checkAllFixtures()
	const report = computeReport(pages, fixtureViolations)

	if (asJson) {
		console.log(JSON.stringify({
			siteFreshness: report.siteFreshness,
			counts: report.counts,
			syncRecommended: report.syncRecommended,
			fixtureViolations: report.fixtureViolations,
			pages: report.pages.map(p => ({
				sourceFile: p.sourceFile,
				zhFile: p.zhFile,
				state: p.state,
				freshness: p.freshness,
				sourceLines: p.sourceLines,
				verdict: p.verdict,
			})),
		}, null, '\t'))
	}
	else {
		printHuman(report)
	}

	// Exit 0 unless --strict (CI visibility mode, non-blocking per Decision D4).
	if (strict && (report.siteFreshness < 100 || report.fixtureViolations.length > 0))
		process.exit(1)
}

main()
	.catch((error) => {
		console.error(error)
		process.exit(1)
	})
