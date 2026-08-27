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
	// Tracked generated outputs (docs/api/*.md, packages/core/src/generated/**)
	// are deliberately NOT listed here: their invariant is "committed bytes
	// equal generator output", which the CI codegen-drift step enforces by
	// re-running the generators and requiring a clean tree. A path ban here
	// would also reject legitimate source-driven regeneration.
	{
		reason: 'build-time output of the PikaCSS engine',
		remedy: 'let the build regenerate it; never commit it',
		matches: path => /(?:^|\/)pika\.gen\.[^/]+$/.test(path),
	},
]

/** The docs example harness whose pipeline shape is protected by invariant, not by byte-freeze. */
export const EXAMPLE_HARNESS_PATH = 'docs/.examples/_utils/pika-example.ts'

/**
 * The example harness must keep driving examples through the real Integration
 * transform pipeline via the repository-private inline-config test seam.
 * Mechanical/type-driven maintenance is allowed; replacing the pipeline with
 * direct `createEngine`/`engine.use()` execution is not, because that bypasses
 * compiler extraction/rewrite and silently invalidates every docs example.
 */
export function exampleHarnessViolations(content: string): string[] {
	const violations: string[] = []
	if (!/import\s+\{[^}]*\bcreateInlineIntegrationTestContext\b[^}]*\}\s+from\s+'@pikacss\/integration\/testing'/.test(content))
		violations.push('must use the repository-private Integration inline-config test harness')
	if (!content.includes('ctx.transform('))
		violations.push('must route example source through the context transform pipeline (`ctx.transform(...)`)')
	if (/\bcreateEngine\s*\(/.test(content))
		violations.push('must not construct an engine directly with `createEngine(...)`')
	if (/\bengine\.use\s*\(/.test(content))
		violations.push('must not resolve styles directly with `engine.use(...)`')
	return violations
}

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
