import { describe, expect, it } from 'vitest'
import {
	findForbiddenPaths,
	hasWaiverLabel,
	isCommentOnlyDiff,
	packageOfSourcePath,
	packagesMissingTestChanges,
} from './gates'

describe('findForbiddenPaths', () => {
	it('flags generated api reference pages but not the hand-written index', () => {
		const findings = findForbiddenPaths(['docs/api/core.md', 'docs/api/index.md'])
		expect(findings.map(f => f.path))
			.toEqual(['docs/api/core.md'])
		expect(findings[0]!.remedy)
			.toContain('maintain-docs:gen-api')
	})

	it('flags generated css data, pika.gen outputs, and the example harness', () => {
		const paths = [
			'packages/core/src/generated/csstype.ts',
			'playground/src/pika.gen.ts',
			'docs/.examples/_utils/pika-example.ts',
		]
		expect(findForbiddenPaths(paths)
			.map(f => f.path))
			.toEqual(paths)
	})

	it('leaves ordinary source and docs alone', () => {
		expect(findForbiddenPaths(['packages/core/src/engine.ts', 'docs/getting-started/setup.md']))
			.toEqual([])
	})
})

describe('isCommentOnlyDiff', () => {
	it('treats a JSDoc-only change as comment-only', () => {
		const diff = [
			'--- a/packages/core/src/engine.ts',
			'+++ b/packages/core/src/engine.ts',
			'@@ -10,0 +11,2 @@',
			'+/**',
			'+ * Renders preflights once per pass.',
			'+ */',
			'- * Old wording.',
		].join('\n')
		expect(isCommentOnlyDiff(diff))
			.toBe(true)
	})

	it('treats a real code change as code, even alongside comments', () => {
		const diff = [
			'--- a/packages/core/src/engine.ts',
			'+++ b/packages/core/src/engine.ts',
			'@@ -10 +10,2 @@',
			'+// bump the counter',
			'+count += 1',
		].join('\n')
		expect(isCommentOnlyDiff(diff))
			.toBe(false)
	})

	it('treats an empty diff as comment-only so renames do not demand tests', () => {
		expect(isCommentOnlyDiff(''))
			.toBe(true)
	})
})

describe('packageOfSourcePath', () => {
	it('extracts the package directory from a package source path', () => {
		expect(packageOfSourcePath('packages/plugin-icons/src/index.ts'))
			.toBe('plugin-icons')
	})

	it('ignores paths outside packages/<name>/src', () => {
		expect(packageOfSourcePath('docs/index.md'))
			.toBeUndefined()
		expect(packageOfSourcePath('packages/core/package.json'))
			.toBeUndefined()
	})
})

describe('packagesMissingTestChanges', () => {
	it('reports a package whose source changed with no test change', () => {
		const result = packagesMissingTestChanges([
			{ path: 'packages/core/src/engine.ts', commentOnly: false },
		])
		expect(result)
			.toEqual(['core'])
	})

	it('accepts a co-located test change in the same package', () => {
		const result = packagesMissingTestChanges([
			{ path: 'packages/core/src/engine.ts', commentOnly: false },
			{ path: 'packages/core/src/engine.test.ts', commentOnly: false },
		])
		expect(result)
			.toEqual([])
	})

	it('does not accept a test change in a different package', () => {
		const result = packagesMissingTestChanges([
			{ path: 'packages/core/src/engine.ts', commentOnly: false },
			{ path: 'packages/unplugin/src/index.test.ts', commentOnly: false },
		])
		expect(result)
			.toEqual(['core'])
	})

	it('ignores comment-only, generated, and .gen source changes', () => {
		const result = packagesMissingTestChanges([
			{ path: 'packages/core/src/engine.ts', commentOnly: true },
			{ path: 'packages/core/src/generated/csstype.ts', commentOnly: false },
			{ path: 'packages/integration/src/ctx.gen.ts', commentOnly: false },
		])
		expect(result)
			.toEqual([])
	})

	it('reports every affected package, sorted', () => {
		const result = packagesMissingTestChanges([
			{ path: 'packages/unplugin/src/index.ts', commentOnly: false },
			{ path: 'packages/core/src/engine.ts', commentOnly: false },
		])
		expect(result)
			.toEqual(['core', 'unplugin'])
	})
})

describe('hasWaiverLabel', () => {
	it('detects the waiver label in a comma-separated list', () => {
		expect(hasWaiverLabel('dependencies, no-test-needed'))
			.toBe(true)
	})

	it('rejects absent, empty, and partial matches', () => {
		expect(hasWaiverLabel(undefined))
			.toBe(false)
		expect(hasWaiverLabel(''))
			.toBe(false)
		expect(hasWaiverLabel('no-test-needed-really'))
			.toBe(false)
	})
})
