import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { hasInternalJsDocTag, isPrivateOrProtectedDeclaration, selectFunctionApiDeclarations } from '../maintain-docs/api-helpers'
import { relatedSourceIssues } from '../maintain-docs/shared'
import { diffAgainst, numstatAgainst } from '../maintain-i18n/shared'
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

describe('maintenance checker regressions', () => {
	it('preserves git diff output when --no-index reports changed files with exit 1 and stderr warnings', () => {
		const previous = {
			count: process.env.GIT_CONFIG_COUNT,
			key: process.env.GIT_CONFIG_KEY_0,
			value: process.env.GIT_CONFIG_VALUE_0,
		}
		process.env.GIT_CONFIG_COUNT = '1'
		process.env.GIT_CONFIG_KEY_0 = 'core.autocrlf'
		process.env.GIT_CONFIG_VALUE_0 = 'true'
		try {
			const stats = numstatAgainst('__old_translation_source__\n', 'index.md')
			expect(stats.added + stats.deleted)
				.toBeGreaterThan(0)
			expect(diffAgainst('__old_translation_source__\n', 'index.md'))
				.toContain('__old_translation_source__')
		}
		finally {
			for (const [key, value] of Object.entries({
				GIT_CONFIG_COUNT: previous.count,
				GIT_CONFIG_KEY_0: previous.key,
				GIT_CONFIG_VALUE_0: previous.value,
			})) {
				if (value === undefined)
					delete process.env[key]
				else
					process.env[key] = value
			}
		}
	})

	it('does not swallow genuine git errors from translation diffs', () => {
		expect(() => diffAgainst('__old_translation_source__\n', '__definitely_missing_translation_page__.md'))
			.toThrow()
	})

	it('flags docs relatedSources that no longer exist', () => {
		expect(relatedSourceIssues(['AGENTS.md']))
			.toEqual([])
		expect(relatedSourceIssues(['packages/integration/src/definitely-missing.ts']))
			.toEqual(['relatedSources target does not exist: packages/integration/src/definitely-missing.ts'])
	})

	it('keeps every declared overload while excluding the implementation signature', () => {
		const source = ts.createSourceFile(
			'a.ts',
			'function f(value: string): string; function f(value: number, radix?: number): string; function f(value: string | number): string { return String(value) }',
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TS,
		)
		const declarations = source.statements.filter(ts.isFunctionDeclaration)
		const selected = selectFunctionApiDeclarations(declarations)
		expect(selected)
			.toHaveLength(2)
		expect(selected.map(declaration => declaration.parameters.map(parameter => parameter.name.getText())))
			.toEqual([['value'], ['value', 'radix']])
		expect(selected.every(declaration => declaration.body == null))
			.toBe(true)
	})

	it('recognizes member-level @internal tags for API-doc filtering', () => {
		expect(hasInternalJsDocTag([{ name: 'internal' }]))
			.toBe(true)
		expect(hasInternalJsDocTag([{ name: 'default' }]))
			.toBe(false)
	})

	it('excludes ECMAScript #private as well as private/protected TypeScript members from API docs', () => {
		const source = ts.createSourceFile(
			'a.ts',
			'class Example { #hidden = 1; private alsoHidden = 2; protected inherited = 3; public visible = 4 }',
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TS,
		)
		const declaration = source.statements[0]
		expect(declaration != null && ts.isClassDeclaration(declaration))
			.toBe(true)
		const members = (declaration as ts.ClassDeclaration).members
		expect(members.map(isPrivateOrProtectedDeclaration))
			.toEqual([true, true, true, false])
	})
})
