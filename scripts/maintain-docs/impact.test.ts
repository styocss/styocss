import type { TaskFile } from './shared'
import { describe, expect, it } from 'vitest'
import { changedPathsFromNameStatus, findDocsImpacts } from './impact'

function task(docsPath: string, relatedSources: string[]): TaskFile {
	return {
		templatePath: `.claude/skills/maintain-docs/templates/pages/${docsPath.replace(/^docs\//, '')}`,
		docsPath,
		status: 'ok',
		section: 'Test',
		issues: [],
		relatedSources,
	}
}

describe('git changed-path parsing', () => {
	it('includes deleted paths and both sides of renames', () => {
		expect(changedPathsFromNameStatus('D\0packages/deleted.ts\0R100\0packages/old.ts\0packages/new.ts\0M\0packages/changed.ts\0'))
			.toEqual([
				'packages/deleted.ts',
				'packages/old.ts',
				'packages/new.ts',
				'packages/changed.ts',
			])
	})
})

describe('documentation source impact', () => {
	it('maps exact changed source paths back to their documentation pages', () => {
		const impacts = findDocsImpacts([
			task('docs/a.md', ['packages/a/src/index.ts', 'packages/shared.ts']),
			task('docs/b.md', ['packages/b/src/index.ts']),
		], new Set(['packages/a/src/index.ts']))

		expect(impacts)
			.toEqual([{
				docsPath: 'docs/a.md',
				matchedSources: ['packages/a/src/index.ts'],
				touched: false,
			}])
	})

	it('distinguishes pages already touched in the same change', () => {
		const impacts = findDocsImpacts([
			task('docs/a.md', ['packages/a/src/index.ts']),
		], new Set(['packages/a/src/index.ts', 'docs/a.md']))

		expect(impacts[0]?.touched)
			.toBe(true)
	})

	it('does not treat path prefixes as dependency matches', () => {
		const impacts = findDocsImpacts([
			task('docs/a.md', ['packages/a/src/index.ts']),
		], new Set(['packages/a/src/index.ts.extra']))

		expect(impacts)
			.toEqual([])
	})
})
