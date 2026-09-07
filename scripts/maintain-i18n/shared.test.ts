import { describe, expect, it } from 'vitest'
import { checkAllFixtures, checkFixtureCompleteness, checkFixtureContents, parseTranslationBlock, writeTranslationBlock } from './shared'

describe('docs example fixture completeness', () => {
	it('reports an English fixture that has no zh-TW mirror', () => {
		expect(
			checkFixtureCompleteness(['.examples/missing.ts'], []),
		)
			.toEqual([{
				zhFile: 'docs/zh-tw/.examples/missing.ts',
				sourceFile: 'docs/.examples/missing.ts',
				reason: 'zh-TW fixture counterpart does not exist (missing mirror)',
			}])
	})

	it('reports a zh-TW fixture that has no English counterpart', () => {
		expect(
			checkFixtureCompleteness([], ['zh-tw/.examples/orphan.ts']),
		)
			.toEqual([{
				zhFile: 'docs/zh-tw/.examples/orphan.ts',
				sourceFile: 'docs/.examples/orphan.ts',
				reason: 'English fixture counterpart does not exist (orphaned copy)',
			}])
	})

	it('accepts a TypeScript fixture whose only difference is translated comments', () => {
		const source = `const value = 'https://example.test//literal'\n// English comment\nexport default value\n`
		const zh = `const value = 'https://example.test//literal'\n// 繁體中文註解\nexport default value\n`

		expect(
			checkFixtureContents(
				'zh-tw/.examples/example.ts',
				'.examples/example.ts',
				zh,
				source,
			),
		)
			.toBeNull()
	})

	it('accepts the repository fixture set', async () => {
		expect(await checkAllFixtures())
			.toEqual([])
	})
})

describe('translation provenance', () => {
	it('supports a source blob without a source commit for same-change synchronization', () => {
		const content = '---\ntitle: 測試\n---\n\n內容\n'
		const updated = writeTranslationBlock(content, {
			sourceFile: 'docs/example.md',
			sourceBlob: '0123456789abcdef',
		})

		expect(updated)
			.not
			.toContain('sourceCommit:')
		expect(parseTranslationBlock(updated))
			.toEqual({
				sourceFile: 'docs/example.md',
				sourceBlob: '0123456789abcdef',
			})
	})
})
