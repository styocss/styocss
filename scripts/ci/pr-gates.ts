/**
 * Deterministic pull-request gates. Run in CI on pull requests, and locally with:
 *
 *   pnpm ci:pr-gates                 # compares against origin/main
 *   BASE_REF=main pnpm ci:pr-gates   # compare against something else
 *
 * CI has no LLM reviewer, so every rule that can be checked mechanically is
 * checked here instead of being left to a contributor who has not read AGENTS.md.
 */

import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { workspaceRoot } from '../_skill-shared'
import {
	findForbiddenPaths,
	hasWaiverLabel,
	isCommentOnlyDiff,
	NO_TEST_NEEDED_LABEL,
	packageOfSourcePath,
	packagesMissingTestChanges,
} from './gates'

const baseRef = process.env.BASE_REF ?? 'origin/main'

function git(...args: string[]): string {
	return execFileSync('git', args, { cwd: workspaceRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

function mergeBase(): string {
	try {
		return git('merge-base', baseRef, 'HEAD')
			.trim()
	}
	catch {
		console.error(`error: cannot resolve a merge base against ${baseRef}. Fetch it first (CI needs fetch-depth: 0).`)
		process.exit(2)
	}
}

const base = mergeBase()

const changedPaths = git('diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`)
	.split('\n')
	.map(line => line.trim())
	.filter(Boolean)

if (changedPaths.length === 0) {
	console.log('No changed files against the base; nothing to gate.')
	process.exit(0)
}

const failures: string[] = []

// ---------------------------------------------------------------------------
// Gate: files that a generator owns, or that must never change
// ---------------------------------------------------------------------------

for (const finding of findForbiddenPaths(changedPaths))
	failures.push(`${finding.path}: ${finding.reason}. ${finding.remedy}`)

// ---------------------------------------------------------------------------
// Gate: behavior changed in a package without any test in that package changing
// ---------------------------------------------------------------------------

const sourceFiles = changedPaths
	.filter(path => packageOfSourcePath(path) != null)
	.map(path => ({
		path,
		commentOnly: isCommentOnlyDiff(git('diff', '-U0', `${base}...HEAD`, '--', path)),
	}))

const missingTests = packagesMissingTestChanges(sourceFiles)
const waived = hasWaiverLabel(process.env.PR_LABELS)

if (missingTests.length > 0) {
	const detail = missingTests.map(pkg => `packages/${pkg}`)
		.join(', ')
	if (waived) {
		console.log(`note: regression-test requirement waived by the "${NO_TEST_NEEDED_LABEL}" label (${detail}).`)
	}
	else {
		failures.push(
			`${detail}: source changed with no test change in the same package. `
			+ `Every fix ships a regression test that fails without it. `
			+ `If this change genuinely cannot be pinned by a test, the repository owner adds the "${NO_TEST_NEEDED_LABEL}" label.`,
		)
	}
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

if (failures.length > 0) {
	console.error(`\n❌ ${failures.length} pull-request gate failure(s):\n`)
	for (const failure of failures)
		console.error(`  - ${failure}`)
	console.error('')
	process.exit(1)
}

console.log(`Pull-request gates OK (${changedPaths.length} changed files, ${sourceFiles.length} package source files).`)
