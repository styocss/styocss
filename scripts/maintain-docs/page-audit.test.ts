import { describe, expect, it } from 'vitest'
import { checkFrontmatter, checkHeadingConformity, checkNextSection, checkPageRegistry, checkTablePropertyConformity, handAuthoredInventoryIssues } from './page-audit'

const validFrontmatter = `---
title: Setup
description: Configure PikaCSS.
relatedPackages:
  - '@pikacss/core'
relatedSources:
  - 'packages/core/src/index.ts'
category: getting-started
order: 10
---
`

describe('documentation page audit', () => {
	it('keeps the page registry internally consistent', () => {
		expect(checkPageRegistry())
			.toEqual([])
	})

	it('detects stray hand-authored pages and registry entries without templates', () => {
		const issues = handAuthoredInventoryIssues(
			['docs/getting-started/setup.md'],
			['docs/getting-started/setup.md', 'docs/getting-started/stray.md'],
		)

		expect(issues)
			.toContain('Hand-authored docs page is missing a template: docs/getting-started/stray.md')
		expect(issues)
			.toContain('Hand-authored docs page is missing from the page registry: /getting-started/stray')
		expect(issues)
			.toContain('Hand-authored page registry entry is missing a template: /api/')
	})

	it('accepts complete frontmatter in the expected section', () => {
		expect(checkFrontmatter(validFrontmatter, { category: 'getting-started', order: 10 }))
			.toEqual([])
	})

	it('requires source/package provenance and a numeric order', () => {
		const content = `---
title: Setup
description: Configure PikaCSS.
category: getting-started
order: first
---
`

		expect(checkFrontmatter(content, { category: 'getting-started', order: 10 }))
			.toEqual([
				'Frontmatter missing or empty \'relatedPackages\'',
				'Frontmatter missing or empty \'relatedSources\'',
				'Frontmatter missing or invalid \'order\'',
			])
	})

	it('requires category ownership to match the page path', () => {
		const content = validFrontmatter.replace('category: getting-started', 'category: integrations')

		expect(checkFrontmatter(content, { category: 'getting-started', order: 10 }))
			.toContain('Frontmatter \'category\' is \'integrations\' — expected \'getting-started\' from the page registry')
	})

	it('requires order to match the page registry', () => {
		const content = validFrontmatter.replace('order: 10', 'order: 99')

		expect(checkFrontmatter(content, { category: 'getting-started', order: 10 }))
			.toContain('Frontmatter \'order\' is \'99\' — expected \'10\' from the page registry')
	})

	it('detects missing contracted headings, table rows, and Next section', () => {
		const template = `# Setup

## Install

| Property | Description |
|---|---|
| \`config\` | <!-- required --> |

## Next
`
		const docs = `${validFrontmatter}
# Setup

## Install

| Property | Description |
|---|---|
| \`cwd\` | Working directory. |
`

		expect(checkHeadingConformity(template, docs))
			.toContain('Missing heading: ## Next')
		expect(checkTablePropertyConformity(template, docs))
			.toContain('Missing table property: `config`')
		expect(checkNextSection(docs))
			.toBe('Missing ## Next section')
	})
})
