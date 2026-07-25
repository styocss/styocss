/**
 * Pure logic for the pull-request gates. Kept separate from `pr-gates.ts` so it
 * can be unit tested without a git repository.
 *
 * These gates encode the rules from AGENTS.md that a contributor who never read
 * AGENTS.md would otherwise break. CI carries no LLM reviewer, so anything
 * expressible as a script belongs here rather than in prose.
 */

/** A path that must never be hand-edited, with the command that regenerates it. */
export interface ForbiddenPathRule {
	/** Human-readable reason, used in the failure message. */
	reason: string
	/** What to run instead of editing by hand, when a generator owns the file. */
	remedy: string
	/** Returns true when `path` is covered by this rule. */
	matches: (path: string) => boolean
}

export const FORBIDDEN_PATH_RULES: ForbiddenPathRule[] = [
	{
		reason: 'generated API reference page',
		remedy: 'pnpm maintain-docs:gen-api',
		matches: path => /^docs\/api\/(?!index\.md$)[^/]+\.md$/.test(path),
	},
	{
		reason: 'generated CSS data',
		remedy: 'pnpm generate:core:css',
		matches: path => path.startsWith('packages/core/src/generated/'),
	},
	{
		reason: 'build-time output of the PikaCSS engine',
		remedy: 'let the build regenerate it; never commit it',
		matches: path => /(?:^|\/)pika\.gen\.[^/]+$/.test(path),
	},
	{
		reason: 'the docs example harness that drives every example through the real createCtx pipeline',
		remedy: 'leave it alone — replacing it with createEngine bypasses the transform/extract flow and breaks all examples',
		matches: path => path === 'docs/.examples/_utils/pika-example.ts',
	},
]

export interface ForbiddenPathFinding {
	path: string
	reason: string
	remedy: string
}

export function findForbiddenPaths(changedPaths: string[]): ForbiddenPathFinding[] {
	const findings: ForbiddenPathFinding[] = []
	for (const path of changedPaths) {
		const rule = FORBIDDEN_PATH_RULES.find(r => r.matches(path))
		if (rule != null)
			findings.push({ path, reason: rule.reason, remedy: rule.remedy })
	}
	return findings
}

/**
 * True when every added/removed line in a unified diff is a comment or blank.
 *
 * JSDoc-only sweeps touch many source files without changing behavior, so they
 * must not trip the "source changed but no test changed" gate. Anything that is
 * not clearly a comment counts as a code change: the gate errs toward asking
 * for a test.
 */
export function isCommentOnlyDiff(diff: string): boolean {
	const changedLines = diff
		.split('\n')
		.filter(line => /^[+-]/.test(line) && !/^(?:\+\+\+|---)/.test(line))
		.map(line => line.slice(1)
			.trim())

	if (changedLines.length === 0)
		return true

	return changedLines.every(line =>
		line === ''
		|| line.startsWith('//')
		|| line.startsWith('/*')
		|| line.startsWith('*/')
		|| line.startsWith('*'),
	)
}

const RE_PACKAGE_SOURCE = /^packages\/([^/]+)\/src\/.+\.tsx?$/
const RE_TEST_FILE = /\.(?:test|spec|bench)\.tsx?$/

/** Source files whose changes never need a matching test change. */
function isExemptSource(path: string): boolean {
	return RE_TEST_FILE.test(path)
		|| path.includes('/src/generated/')
		|| /\.gen\.[^/]+$/.test(path)
}

export function packageOfSourcePath(path: string): string | undefined {
	const match = RE_PACKAGE_SOURCE.exec(path)
	return match?.[1]
}

export interface ChangedSourceFile {
	path: string
	commentOnly: boolean
}

/**
 * Packages whose behavior changed without any test file in the same package
 * changing. AGENTS.md requires every fix to ship a regression test; this is the
 * part of that rule a script can prove.
 */
export function packagesMissingTestChanges(files: ChangedSourceFile[]): string[] {
	const changedCode = new Set<string>()
	const changedTests = new Set<string>()

	for (const { path, commentOnly } of files) {
		const pkg = packageOfSourcePath(path)
		if (pkg == null)
			continue

		if (RE_TEST_FILE.test(path)) {
			changedTests.add(pkg)
			continue
		}

		if (isExemptSource(path) || commentOnly)
			continue

		changedCode.add(pkg)
	}

	return [...changedCode].filter(pkg => !changedTests.has(pkg))
		.sort()
}

/** Label an owner applies to waive the regression-test requirement on one pull request. */
export const NO_TEST_NEEDED_LABEL = 'no-test-needed'

export function hasWaiverLabel(rawLabels: string | undefined): boolean {
	if (rawLabels == null)
		return false
	return rawLabels
		.split(',')
		.map(label => label.trim())
		.includes(NO_TEST_NEEDED_LABEL)
}
