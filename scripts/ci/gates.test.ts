import { describe, expect, it } from 'vitest'
import {
	exampleHarnessViolations,
	findForbiddenPaths,
	hasWaiverLabel,
	isCommentOnlyDiff,
	packageOfSourcePath,
	packagesMissingTestChanges,
} from './gates'

describe('findForbiddenPaths', () => {
	it('flags ephemeral pika.gen outputs that must never be committed', () => {
		const findings = findForbiddenPaths(['playground/src/pika.gen.ts', 'demo/src/pika.gen.css'])
		expect(findings.map(f => f.path))
			.toEqual(['playground/src/pika.gen.ts', 'demo/src/pika.gen.css'])
	})

	it('allows tracked generated outputs whose drift the codegen-drift CI step verifies', () => {
		// docs/api pages and core generated data legitimately change whenever
		// their sources change; hand edits are caught by re-running the
		// generators in CI, not by banning the paths.
		expect(findForbiddenPaths([
			'docs/api/core.md',
			'docs/api/index.md',
			'packages/core/src/generated/csstype.ts',
		]))
			.toEqual([])
	})

	it('leaves the example harness to the invariant gate and ordinary files alone', () => {
		expect(findForbiddenPaths([
			'docs/.examples/_utils/pika-example.ts',
			'packages/core/src/engine.ts',
			'docs/getting-started/setup.md',
		]))
			.toEqual([])
	})
})

describe('exampleHarnessViolations', () => {
	const conforming = [
		'import { createInlineIntegrationTestContext } from \'@pikacss/integration/testing\'',
		'const ctx = createInlineIntegrationTestContext({})',
		'await ctx.transform(code, id)',
	].join('\n')

	it('accepts a harness that drives examples through the repository-private Integration pipeline', () => {
		expect(exampleHarnessViolations(conforming))
			.toEqual([])
	})

	it('rejects dropping the private harness import or the transform call', () => {
		expect(exampleHarnessViolations('const x = 1'))
			.toHaveLength(2)
	})

	it('rejects the removed public createCtx compatibility import', () => {
		const legacy = [
			'import { createCtx } from \'@pikacss/integration\'',
			'const ctx = createCtx({})',
			'await ctx.transform(code, id)',
		].join('\n')
		expect(exampleHarnessViolations(legacy))
			.toContain('must use the repository-private Integration inline-config test harness')
	})

	it('rejects replacing the pipeline with direct engine execution', () => {
		const bypassing = `${conforming}\nconst engine = await createEngine({})\nawait engine.use({})`
		const violations = exampleHarnessViolations(bypassing)
		expect(violations.some(v => v.includes('createEngine')))
			.toBe(true)
		expect(violations.some(v => v.includes('engine.use')))
			.toBe(true)
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
